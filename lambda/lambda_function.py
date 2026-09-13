import os
import json
import uuid
import boto3
from decimal import Decimal
from datetime import datetime, timezone

# =========================
# AWS CLIENTS
# =========================

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
sns = boto3.client("sns")

# =========================
# ENVIRONMENT VARIABLES
# =========================

BUCKET_NAME = os.environ.get("BUCKET_NAME", "my-doc-system-approved")
TABLE_NAME = os.environ.get("TABLE_NAME", "FileMetadata")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")

PENDING_PREFIX = os.environ.get("PENDING_PREFIX", "pending/")
APPROVED_PREFIX = os.environ.get("APPROVED_PREFIX", "approved/")

if PENDING_PREFIX and not PENDING_PREFIX.endswith("/"):
    PENDING_PREFIX += "/"
if APPROVED_PREFIX and not APPROVED_PREFIX.endswith("/"):
    APPROVED_PREFIX += "/"

# =========================
# DYNAMODB TABLE
# =========================

table = dynamodb.Table(TABLE_NAME)

# =========================
# DECIMAL ENCODER (لحل Internal Server Error)
# =========================

class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super(DecimalEncoder, self).default(o)

# =========================
# RESPONSE HELPER
# =========================

def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
        },
        "body": json.dumps(body, cls=DecimalEncoder)
    }

# =========================
# GET COGNITO CLAIMS
# =========================

def get_claims(event):
    try:
        return (
            event.get("requestContext", {})
            .get("authorizer", {})
            .get("claims", {})
        ) or {}
    except (KeyError, TypeError):
        return {}

# =========================
# GET USER INFORMATION
# =========================

def get_user_info(event):
    claims = get_claims(event)

    user_id = claims.get("sub") or claims.get("username") or "anonymous_user"
    email = claims.get("email") or "no-email@domain.com"
    groups = claims.get("cognito:groups", [])

    if isinstance(groups, str):
        groups = [g.strip() for g in groups.split(",") if g.strip()]

    return {
        "user_id": str(user_id),
        "email": str(email),
        "groups": groups
    }

# =========================
# CHECK ADMIN
# =========================

def is_admin(user):
    return "Admins" in user.get("groups", [])

# =========================
# PARSE REQUEST BODY
# =========================

def parse_body(event):
    raw_body = event.get("body")
    if isinstance(raw_body, dict):
        return raw_body
    if isinstance(raw_body, str) and raw_body.strip():
        try:
            return json.loads(raw_body)
        except Exception:
            return {}
    return {}

# =========================
# UPLOAD INITIATE
# =========================

def upload_initiate(event):
    user = get_user_info(event)

    body = parse_body(event)
    file_name = body.get("fileName")
    content_type = body.get("contentType")

    if not file_name or not content_type:
        return response(400, {"message": "fileName and contentType are required"})

    file_id = str(uuid.uuid4())
    safe_file_name = os.path.basename(file_name)

    s3_key = f"{PENDING_PREFIX}{user['user_id']}/{file_id}/{safe_file_name}"

    try:
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": BUCKET_NAME,
                "Key": s3_key,
                "ContentType": content_type
            },
            ExpiresIn=300
        )
    except Exception as e:
        print(f"Presigned URL error: {e}")
        return response(500, {"message": f"Unable to generate upload URL: {str(e)}"})

    return response(200, {
        "fileId": file_id,
        "uploadUrl": upload_url,
        "s3Key": s3_key,
        "expiresIn": 300
    })

# =========================
# UPLOAD COMPLETE
# =========================

def upload_complete(event):
    user = get_user_info(event)
    body = parse_body(event)

    file_id = body.get("fileId")
    if not file_id:
        return response(400, {"message": "fileId is required"})

    objects = []
    try:
        result = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=PENDING_PREFIX)
        objects = [
            obj for obj in result.get("Contents", [])
            if file_id in obj.get("Key", "")
        ]

        if not objects:
            fallback_result = s3.list_objects_v2(Bucket=BUCKET_NAME)
            objects = [
                obj for obj in fallback_result.get("Contents", [])
                if file_id in obj.get("Key", "")
            ]
    except Exception as e:
        print(f"S3 list error: {e}")
        return response(500, {"message": f"Unable to verify uploaded file: {str(e)}"})

    if not objects:
        return response(404, {"message": "Uploaded file not found in S3"})

    uploaded_object = objects[0]
    s3_key = uploaded_object["Key"]
    file_size = uploaded_object["Size"]
    file_name = os.path.basename(s3_key)

    try:
        head = s3.head_object(Bucket=BUCKET_NAME, Key=s3_key)
        content_type = head.get("ContentType", "application/octet-stream")
    except Exception:
        content_type = "application/octet-stream"

    uploaded_at = datetime.now(timezone.utc).isoformat()

    item = {
        "fileId": str(file_id),
        "userId": str(user["user_id"]),
        "userEmail": str(user["email"]),
        "fileName": str(file_name),
        "fileType": str(content_type),
        "fileSize": int(file_size),
        "s3Key": str(s3_key),
        "uploadDate": str(uploaded_at),
        "status": "PENDING"
    }

    try:
        table.put_item(Item=item)
        print(f"DynamoDB Item inserted: {file_id}")
    except Exception as e:
        print(f"DynamoDB error: {e}")
        return response(500, {"message": f"Unable to save file metadata: {str(e)}"})

    if SNS_TOPIC_ARN:
        try:
            sns.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject="New File Pending Approval",
                Message=f"File: {file_name}\nUser: {user['email']}\nFile ID: {file_id}\nStatus: PENDING"
            )
        except Exception as e:
            print(f"SNS notification error: {e}")

    return response(200, {
        "message": "File uploaded successfully and is pending approval",
        "fileId": file_id,
        "status": "PENDING"
    })

# =========================
# GET PENDING FILES
# =========================

def get_pending_files(event):
    user = get_user_info(event)

    if not is_admin(user):
        return response(403, {"message": "Admin access required"})

    try:
        result = table.scan()
        items = result.get("Items", [])
        pending_items = [item for item in items if item.get("status") == "PENDING"]

        return response(200, {"files": pending_items})

    except Exception as e:
        print(f"DynamoDB scan error: {e}")
        return response(500, {"message": f"Unable to get pending files: {str(e)}"})

# =========================
# APPROVE FILE
# =========================

def approve_file(event):
    user = get_user_info(event)

    if not is_admin(user):
        return response(403, {"message": "Admin access required"})

    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")

    if not file_id:
        return response(400, {"message": "fileId is required"})

    try:
        result = table.get_item(Key={"fileId": file_id})
    except Exception as e:
        return response(500, {"message": f"Unable to get file: {str(e)}"})

    item = result.get("Item")
    if not item:
        return response(404, {"message": "File not found"})

    if item.get("status") != "PENDING":
        return response(409, {"message": "File has already been processed"})

    old_key = item["s3Key"]
    file_name = item["fileName"]
    new_key = f"{APPROVED_PREFIX}{item.get('userId', 'user')}/{file_id}/{file_name}"

    try:
        s3.copy_object(
            Bucket=BUCKET_NAME,
            CopySource={"Bucket": BUCKET_NAME, "Key": old_key},
            Key=new_key
        )
        s3.delete_object(Bucket=BUCKET_NAME, Key=old_key)

        table.update_item(
            Key={"fileId": file_id},
            UpdateExpression="SET #status = :approved, approvedBy = :admin, approvedAt = :time, s3Key = :newkey",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":approved": "APPROVED",
                ":admin": user["email"],
                ":time": datetime.now(timezone.utc).isoformat(),
                ":newkey": new_key
            }
        )
    except Exception as e:
        print(f"Approval error: {e}")
        return response(500, {"message": f"Unable to approve file: {str(e)}"})

    return response(200, {"message": "File approved successfully", "fileId": file_id, "status": "APPROVED"})

# =========================
# REJECT FILE
# =========================

def reject_file(event):
    user = get_user_info(event)

    if not is_admin(user):
        return response(403, {"message": "Admin access required"})

    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")

    if not file_id:
        return response(400, {"message": "fileId is required"})

    try:
        result = table.get_item(Key={"fileId": file_id})
    except Exception as e:
        return response(500, {"message": f"Unable to get file: {str(e)}"})

    item = result.get("Item")
    if not item:
        return response(404, {"message": "File not found"})

    if item.get("status") != "PENDING":
        return response(409, {"message": "File has already been processed"})

    try:
        s3.delete_object(Bucket=BUCKET_NAME, Key=item["s3Key"])

        table.update_item(
            Key={"fileId": file_id},
            UpdateExpression="SET #status = :rejected, rejectedBy = :admin, rejectedAt = :time",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":rejected": "REJECTED",
                ":admin": user["email"],
                ":time": datetime.now(timezone.utc).isoformat()
            }
        )
    except Exception as e:
        print(f"Rejection error: {e}")
        return response(500, {"message": f"Unable to reject file: {str(e)}"})

    return response(200, {"message": "File rejected successfully", "fileId": file_id, "status": "REJECTED"})

# =========================
# MAIN LAMBDA HANDLER
# =========================

def lambda_handler(event, context):
    method = event.get("httpMethod", "")
    resource = event.get("resource", "")
    path = event.get("path", "")

    if method == "OPTIONS":
        return response(200, {"message": "CORS preflight"})

    if method == "POST" and (resource == "/upload/initiate" or path.endswith("/upload/initiate")):
        return upload_initiate(event)

    if method == "POST" and (resource == "/upload/complete" or path.endswith("/upload/complete")):
        return upload_complete(event)

    if method == "GET" and (resource == "/admin/files" or path.endswith("/admin/files")):
        return get_pending_files(event)

    if method == "POST" and ("/approve" in resource or path.endswith("/approve")):
        return approve_file(event)

    if method == "POST" and ("/reject" in resource or path.endswith("/reject")):
        return reject_file(event)

    return response(404, {"message": f"Route not found: {method} {path or resource}"})