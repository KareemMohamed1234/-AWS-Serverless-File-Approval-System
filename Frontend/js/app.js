/* =========================================================
   COGNITO
========================================================= */

function getUserPool() {

    const poolData = {
        UserPoolId: CONFIG.USER_POOL_ID,
        ClientId: CONFIG.CLIENT_ID
    };

    return new AmazonCognitoIdentity.CognitoUserPool(poolData);
}


/* =========================================================
   GET CURRENT USER
========================================================= */

function getCurrentCognitoUser() {

    const userPool = getUserPool();

    return userPool.getCurrentUser();
}


/* =========================================================
   LOGIN
========================================================= */

const loginForm = document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", function (event) {

        event.preventDefault();


        const email =
            document.getElementById("loginEmail").value.trim();

        const password =
            document.getElementById("loginPassword").value;


        const message =
            document.getElementById("loginMessage");


        message.innerText = "Logging in...";
        message.className = "message";


        const authenticationData = {

            Username: email,

            Password: password

        };


        const authenticationDetails =
            new AmazonCognitoIdentity.AuthenticationDetails(
                authenticationData
            );


        const userData = {

            Username: email,

            Pool: getUserPool()

        };


        const cognitoUser =
            new AmazonCognitoIdentity.CognitoUser(userData);


        cognitoUser.authenticateUser(

            authenticationDetails,

            {

                onSuccess: function (result) {

                    console.log("Login successful");


                    const accessToken =
                        result
                            .getAccessToken()
                            .getJwtToken();


                    const idToken =
                        result
                            .getIdToken()
                            .getJwtToken();


                    localStorage.setItem(
                        "accessToken",
                        accessToken
                    );


                    localStorage.setItem(
                        "idToken",
                        idToken
                    );


                    localStorage.setItem(
                        "userEmail",
                        email
                    );


                    /*
                       Get groups from ID Token
                    */

                    const payload =
                        result
                            .getIdToken()
                            .decodePayload();


                    const groups =
                        payload["cognito:groups"] || [];


                    console.log("Groups:", groups);


                    message.innerText =
                        "Login successful. Redirecting...";


                    /*
                       ADMIN
                    */

                    if (groups.includes("Admins")) {

                        window.location.href =
                            "admin.html";

                    }


                    /*
                       NORMAL USER
                    */

                    else {

                        window.location.href =
                            "user.html";

                    }

                },


                onFailure: function (err) {

                    console.error(err);


                    message.innerText =
                        err.message ||
                        "Login failed.";


                    message.className =
                        "message error";

                }

            }

        );

    });

}


/* =========================================================
   REGISTER
========================================================= */

const registerForm =
    document.getElementById("registerForm");


if (registerForm) {

    registerForm.addEventListener(
        "submit",
        function (event) {

            event.preventDefault();


            const email =
                document
                    .getElementById("registerEmail")
                    .value
                    .trim();


            const password =
                document
                    .getElementById("registerPassword")
                    .value;


            const confirmPassword =
                document
                    .getElementById("registerPasswordConfirm")
                    .value;


            const message =
                document.getElementById(
                    "registerMessage"
                );


            if (password !== confirmPassword) {

                message.innerText =
                    "Passwords do not match.";

                message.className =
                    "message error";

                return;

            }


            message.innerText =
                "Creating account...";

            message.className =
                "message";


            const attributeList = [];


            const emailAttribute =
                new AmazonCognitoIdentity.CognitoUserAttribute({

                    Name: "email",

                    Value: email

                });


            attributeList.push(emailAttribute);


            getUserPool().signUp(

                email,

                password,

                attributeList,

                null,

                function (err, result) {

                    if (err) {

                        console.error(err);


                        message.innerText =
                            err.message ||
                            "Registration failed.";

                        message.className =
                            "message error";

                        return;

                    }


                    console.log(
                        "Registration successful"
                    );


                    message.innerText =
                        "Account created. Check your email for the confirmation code.";

                    message.className =
                        "message success";


                    /*
                       Hide registration form
                    */

                    registerForm.classList.add(
                        "hidden"
                    );


                    /*
                       Show confirmation form
                    */

                    document
                        .getElementById(
                            "confirmForm"
                        )
                        .classList.remove(
                            "hidden"
                        );


                    /*
                       Save email temporarily
                    */

                    sessionStorage.setItem(
                        "confirmationEmail",
                        email
                    );

                }

            );

        }

    );

}


/* =========================================================
   CONFIRM REGISTRATION
========================================================= */

const confirmForm =
    document.getElementById("confirmForm");


if (confirmForm) {

    confirmForm.addEventListener(
        "submit",
        function (event) {

            event.preventDefault();


            const code =
                document
                    .getElementById(
                        "confirmationCode"
                    )
                    .value
                    .trim();


            const email =
                sessionStorage.getItem(
                    "confirmationEmail"
                );


            const message =
                document.getElementById(
                    "registerMessage"
                );


            if (!email) {

                message.innerText =
                    "Registration session expired. Please register again.";

                message.className =
                    "message error";

                return;

            }


            const userData = {

                Username: email,

                Pool: getUserPool()

            };


            const cognitoUser =
                new AmazonCognitoIdentity.CognitoUser(
                    userData
                );


            message.innerText =
                "Confirming account...";


            cognitoUser.confirmRegistration(

                code,

                true,

                function (err, result) {

                    if (err) {

                        console.error(err);


                        message.innerText =
                            err.message ||
                            "Confirmation failed.";

                        message.className =
                            "message error";

                        return;

                    }


                    console.log(
                        "Account confirmed:",
                        result
                    );


                    message.innerText =
                        "Account confirmed successfully. Redirecting to login...";

                    message.className =
                        "message success";


                    sessionStorage.removeItem(
                        "confirmationEmail"
                    );


                    setTimeout(
                        function () {

                            window.location.href =
                                "login.html";

                        },
                        1500
                    );

                }

            );

        }

    );

}


/* =========================================================
   AUTHORIZATION HELPERS
========================================================= */

function getAccessToken() {

    return localStorage.getItem(
        "accessToken"
    );

}


function getIdToken() {

    return localStorage.getItem(
        "idToken"
    );

}


function isLoggedIn() {

    return !!getAccessToken();

}


function getTokenPayload(token) {

    try {

        const parts =
            token.split(".");


        if (parts.length !== 3) {

            return null;

        }


        const base64 =
            parts[1]
                .replace(/-/g, "+")
                .replace(/_/g, "/");


        const jsonPayload =
            decodeURIComponent(
                atob(base64)
                    .split("")
                    .map(
                        function (c) {

                            return "%" +
                                (
                                    "00" +
                                    c
                                        .charCodeAt(0)
                                        .toString(16)
                                ).slice(-2);

                        }
                    )
                    .join("")
            );


        return JSON.parse(
            jsonPayload
        );

    }

    catch (error) {

        console.error(error);

        return null;

    }

}


/* =========================================================
   GET USER GROUPS
========================================================= */

function getUserGroups() {

    const token =
        getIdToken();


    if (!token) {

        return [];

    }


    const payload =
        getTokenPayload(token);


    if (!payload) {

        return [];

    }


    return payload["cognito:groups"] || [];

}


/* =========================================================
   ADMIN CHECK
========================================================= */

function isAdmin() {

    const groups =
        getUserGroups();


    return groups.includes(
        "Admins"
    );

}


/* =========================================================
   LOGOUT
========================================================= */

function logout() {

    const user =
        getCurrentCognitoUser();


    if (user) {

        user.signOut();

    }


    localStorage.removeItem(
        "accessToken"
    );

    localStorage.removeItem(
        "idToken"
    );

    localStorage.removeItem(
        "userEmail"
    );


    window.location.href =
        "login.html";

}


/* =========================================================
   PROTECT USER PAGE
========================================================= */

if (
    window.location.pathname.endsWith(
        "user.html"
    )
) {

    if (!isLoggedIn()) {

        window.location.href =
            "login.html";

    }

    else {

        const email =
            localStorage.getItem(
                "userEmail"
            );


        const emailElement =
            document.getElementById(
                "userEmail"
            );


        if (emailElement) {

            emailElement.innerText =
                email || "User";

        }


        /*
           If Admin accidentally opens user.html,
           redirect him to admin dashboard.
        */

        if (isAdmin()) {

            window.location.href =
                "admin.html";

        }

    }

}


/* =========================================================
   FILE UPLOAD
========================================================= */

const uploadForm =
    document.getElementById(
        "uploadForm"
    );


if (uploadForm) {

    uploadForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const fileInput =
                document.getElementById(
                    "fileInput"
                );


            const file =
                fileInput.files[0];


            const message =
                document.getElementById(
                    "uploadMessage"
                );


            const button =
                document.getElementById(
                    "uploadButton"
                );


            if (!file) {

                message.innerText =
                    "Please select a file.";

                message.className =
                    "message error";

                return;

            }


            /*
               Maximum size:
               10 MB
            */

            const MAX_FILE_SIZE =
                10 * 1024 * 1024;


            if (
                file.size >
                MAX_FILE_SIZE
            ) {

                message.innerText =
                    "File size must not exceed 10 MB.";

                message.className =
                    "message error";

                return;

            }


            button.disabled = true;

            button.innerText =
                "Preparing upload...";


            message.innerText = "";


            try {

                /*
                   STEP 1
                   Ask Lambda for pre-signed URL
                */

                const initiateResponse =
                    await fetch(

                        CONFIG.API_BASE_URL +
                        "/upload/initiate",

                        {

                            method: "POST",

                            headers: {

                                "Authorization":
                                getIdToken(),

                                "Content-Type":
                                    "application/json"

                            },

                            body:
                                JSON.stringify({

                                    fileName:
                                        file.name,

                                    contentType:
                                        file.type ||
                                        "application/octet-stream"

                                })

                        }

                    );


                const initiateData =
                    await initiateResponse.json();


                if (!initiateResponse.ok) {

                    throw new Error(
                        initiateData.message ||
                        "Failed to initiate upload."
                    );

                }


                console.log(
                    "Initiate:",
                    initiateData
                );


                /*
                   STEP 2
                   Upload directly to S3
                   using pre-signed URL
                */

                button.innerText =
                    "Uploading...";


                const progressContainer =
                    document.getElementById(
                        "uploadProgress"
                    );


                const progressBar =
                    document.getElementById(
                        "progressBarFill"
                    );


                const progressText =
                    document.getElementById(
                        "progressText"
                    );


                progressContainer.classList.remove(
                    "hidden"
                );


                /*
                   XMLHttpRequest allows upload progress
                */

                await uploadToS3(

                    initiateData.uploadUrl,

                    file,

                    function (percent) {

                        progressBar.style.width =
                            percent + "%";


                        progressText.innerText =
                            "Uploading... " +
                            percent +
                            "%";

                    }

                );


                /*
                   STEP 3
                   Tell Lambda upload is complete
                */

                button.innerText =
                    "Finalizing...";


                const completeResponse =
                    await fetch(

                        CONFIG.API_BASE_URL +
                        "/upload/complete",

                        {

                            method: "POST",

                            headers: {

                                "Authorization":
                                getIdToken(),

                                "Content-Type":
                                    "application/json"

                            },

                            body:
                                JSON.stringify({

                                    fileId:
                                        initiateData.fileId

                                })

                        }

                    );


                const completeData =
                    await completeResponse.json();


                if (!completeResponse.ok) {

                    throw new Error(
                        completeData.message ||
                        "Failed to complete upload."
                    );

                }


                console.log(
                    "Complete:",
                    completeData
                );


                /*
                   SUCCESS
                */

                message.innerText =
                    "File uploaded successfully and submitted for approval.";

                message.className =
                    "message success";


                progressText.innerText =
                    "Upload completed successfully.";


                fileInput.value = "";


            }

            catch (error) {

                console.error(error);


                message.innerText =
                    error.message ||
                    "Upload failed.";

                message.className =
                    "message error";

            }


            finally {

                button.disabled = false;

                button.innerText =
                    "Upload File";

            }

        }

    );

}


/* =========================================================
   UPLOAD TO S3
========================================================= */

function uploadToS3(
    uploadUrl,
    file,
    progressCallback
) {

    return new Promise(
        function (resolve, reject) {

            const xhr =
                new XMLHttpRequest();


            xhr.open(
                "PUT",
                uploadUrl,
                true
            );


            /*
               IMPORTANT:
               Content-Type must match
               the pre-signed request.
            */

            xhr.setRequestHeader(
                "Content-Type",
                file.type ||
                "application/octet-stream"
            );


            xhr.upload.onprogress =
                function (event) {

                    if (
                        event.lengthComputable
                    ) {

                        const percent =
                            Math.round(
                                (
                                    event.loaded /
                                    event.total
                                ) * 100
                            );


                        progressCallback(
                            percent
                        );

                    }

                };


            xhr.onload =
                function () {

                    if (
                        xhr.status >= 200 &&
                        xhr.status < 300
                    ) {

                        resolve();

                    }

                    else {

                        reject(
                            new Error(
                                "S3 upload failed. HTTP status: " +
                                xhr.status
                            )
                        );

                    }

                };


            xhr.onerror =
                function () {

                    reject(
                        new Error(
                            "Network error while uploading to S3."
                        )
                    );

                };


            xhr.send(file);

        }
    );

}


/* =========================================================
   ADMIN PAGE PROTECTION
========================================================= */

if (
    window.location.pathname.endsWith(
        "admin.html"
    )
) {

    if (!isLoggedIn()) {

        window.location.href =
            "login.html";

    }

    else if (!isAdmin()) {

        alert(
            "Access denied. Admin privileges required."
        );


        window.location.href =
            "user.html";

    }

    else {

        const email =
            localStorage.getItem(
                "userEmail"
            );


        const emailElement =
            document.getElementById(
                "adminEmail"
            );


        if (emailElement) {

            emailElement.innerText =
                email || "Administrator";

        }


        /*
           Load pending files
        */

        loadPendingFiles();

    }

}


/* =========================================================
   GET PENDING FILES
========================================================= */

async function loadPendingFiles() {

    const tableContainer =
        document.getElementById(
            "filesTableContainer"
        );


    const tableBody =
        document.getElementById(
            "filesTableBody"
        );


    const loading =
        document.getElementById(
            "filesLoading"
        );


    const noFiles =
        document.getElementById(
            "noFiles"
        );


    const count =
        document.getElementById(
            "pendingCount"
        );


    const message =
        document.getElementById(
            "adminMessage"
        );


    if (!tableBody) {

        return;

    }


    loading.classList.remove(
        "hidden"
    );


    tableContainer.classList.add(
        "hidden"
    );


    noFiles.classList.add(
        "hidden"
    );


    message.innerText = "";


    try {

        const response =
            await fetch(

                CONFIG.API_BASE_URL +
                "/admin/files",

                {

                    method: "GET",

                    headers: {

                        "Authorization":

                        getIdToken() 

                    }

                }

            );


        const data =
            await response.json();


        console.log(
            "Pending files:",
            data
        );


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Failed to load files."
            );

        }


        const files =
            data.files || [];


        count.innerText =
            files.length;


        tableBody.innerHTML = "";


        loading.classList.add(
            "hidden"
        );


        if (files.length === 0) {

            noFiles.classList.remove(
                "hidden"
            );

            return;

        }


        tableContainer.classList.remove(
            "hidden"
        );


        files.forEach(
            function (file) {

                const row =
                    document.createElement(
                        "tr"
                    );


                const uploadDate =
                    file.uploadDate
                        ? new Date(
                            file.uploadDate
                        ).toLocaleString()
                        : "-";


                row.innerHTML = `

                    <td>
                        ${escapeHtml(
                            file.fileName || "-"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            file.userEmail || "-"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            file.fileType || "-"
                        )}
                    </td>

                    <td>
                        ${uploadDate}
                    </td>

                    <td>
                        <span class="status pending">
                            PENDING
                        </span>
                    </td>

                    <td>

                        <button
                            class="action-btn approve"
                            onclick="approveFile('${file.fileId}')"
                        >
                            Approve
                        </button>

                        <button
                            class="action-btn reject"
                            onclick="rejectFile('${file.fileId}')"
                        >
                            Reject
                        </button>

                    </td>

                `;


                tableBody.appendChild(
                    row
                );

            }
        );

    }

    catch (error) {

        console.error(error);


        loading.classList.add(
            "hidden"
        );


        message.innerText =
            error.message ||
            "Failed to load pending files.";

        message.className =
            "message error";

    }

}


/* =========================================================
   APPROVE FILE
========================================================= */

async function approveFile(
    fileId
) {

    const confirmed =
        confirm(
            "Are you sure you want to approve this file?"
        );


    if (!confirmed) {

        return;

    }


    try {

        const response =
            await fetch(

                CONFIG.API_BASE_URL +
                "/admin/files/" +
                encodeURIComponent(
                    fileId
                ) +
                "/approve",

                {

                    method: "POST",

                    headers: {

                        "Authorization":
                        getIdToken(),

                        "Content-Type":
                            "application/json"

                    }

                }

            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Failed to approve file."
            );

        }


        alert(
            "File approved successfully."
        );


        loadPendingFiles();

    }

    catch (error) {

        console.error(error);


        alert(
            error.message ||
            "Failed to approve file."
        );

    }

}


/* =========================================================
   REJECT FILE
========================================================= */

async function rejectFile(
    fileId
) {

    const confirmed =
        confirm(
            "Are you sure you want to reject this file?"
        );


    if (!confirmed) {

        return;

    }


    try {

        const response =
            await fetch(

                CONFIG.API_BASE_URL +
                "/admin/files/" +
                encodeURIComponent(
                    fileId
                ) +
                "/reject",

                {

                    method: "POST",

                    headers: {

                        "Authorization":
                        getIdToken(),

                        "Content-Type":
                            "application/json"

                    }

                }

            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Failed to reject file."
            );

        }


        alert(
            "File rejected successfully."
        );


        loadPendingFiles();

    }

    catch (error) {

        console.error(error);


        alert(
            error.message ||
            "Failed to reject file."
        );

    }

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(
    value
) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        value;


    return div.innerHTML;

}