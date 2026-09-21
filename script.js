// ==========================================
// STUDENT MANAGEMENT SYSTEM
// Firebase + Face Attendance
// ==========================================

// ---------- FIREBASE CONFIG ----------
const firebaseConfig = {
    apiKey: "AIzaSyDyuQydwnclYeNlCdum0LSgBXdCMZw-X_4",
    authDomain: "student-management-syste-738df.firebaseapp.com",
    projectId: "student-management-syste-738df",
    storageBucket: "student-management-syste-738df.firebasestorage.app",
    messagingSenderId: "116617400146",
    appId: "1:116617400146:web:9e1036f9f5dcf1ebb2348b",
    measurementId: "G-VSZ1TMJCWV"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// ==========================================
// GLOBAL VARIABLES
// ==========================================
let currentUserData = null;
let registerStream = null;
let attendanceStream = null;
let faceModelsLoaded = false;
let registeredFaceDescriptor = null;
let attendanceChartInstance = null;
let studentCalendarInstance = null;

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

// ==========================================
// COMMON HELPERS
// ==========================================
function $(id) {
    return document.getElementById(id);
}

function showMessage(elementId, message, type = "error") {
    const element = $(elementId);
    if (!element) return;
    element.textContent = message;
    element.className = "message " + type;
}

function todayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatTime(timestamp) {
    if (!timestamp) return "-";
    let date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==========================================
// DARK / LIGHT THEME TOGGLE
// ==========================================
const themeBtn = $("themeToggleBtn");
if (themeBtn) {
    themeBtn.addEventListener("click", () => {
        document.body.classList.toggle("light-theme");
        if (document.body.classList.contains("light-theme")) {
            themeBtn.textContent = "🌙 Dark Mode";
            localStorage.setItem("theme", "light");
        } else {
            themeBtn.textContent = "☀️ Light Mode";
            localStorage.setItem("theme", "dark");
        }
    });

    if (localStorage.getItem("theme") === "light") {
        document.body.classList.add("light-theme");
        themeBtn.textContent = "🌙 Dark Mode";
    } else {
        themeBtn.textContent = "☀️ Light Mode";
    }
}

// ==========================================
// FACE API & CAMERA
// ==========================================
async function loadFaceModels() {
    if (faceModelsLoaded) return true;
    if (typeof faceapi === "undefined") {
        console.error("Face API is not loaded.");
        return false;
    }
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        faceModelsLoaded = true;
        return true;
    } catch (error) {
        console.error("Face model loading error:", error);
        return false;
    }
}

async function startCamera(videoElement) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera is not supported. Use HTTPS or localhost.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
    });
    videoElement.srcObject = stream;
    await videoElement.play();
    return stream;
}

function stopCamera(stream) {
    if (!stream) return;
    stream.getTracks().forEach(track => track.stop());
}

async function getFaceDescriptor(videoElement) {
    if (!faceModelsLoaded) {
        const loaded = await loadFaceModels();
        if (!loaded) throw new Error("Face models could not be loaded.");
    }
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
    const result = await faceapi.detectSingleFace(videoElement, options).withFaceLandmarks().withFaceDescriptor();
    if (!result) throw new Error("No face detected. Please look directly at the camera.");
    return result.descriptor;
}

// ==========================================
// LOGIN LOGIC (ADMIN & STUDENT)
// ==========================================
const loginForm = $("loginForm");
if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const email = $("loginEmail").value.trim();
        const password = $("loginPassword").value;

        if (!email || !password) {
            showMessage("loginMessage", "Please enter email and password.", "error");
            return;
        }

        showMessage("loginMessage", "Logging in...", "info");

        try {
            const credential = await auth.signInWithEmailAndPassword(email, password);
            const uid = credential.user.uid;

            const userDoc = await db.collection("users").doc(uid).get();

            if (!userDoc.exists) {
                throw new Error("Firestore profile missing for account. Please register again.");
            }

            const userData = userDoc.data();
            const role = String(userData.role || "").trim().toLowerCase();

            if (role === "admin") {
                showMessage("loginMessage", "Admin login successful!", "success");
                setTimeout(() => window.location.replace("admin.html"), 300);
                return;
            }

            if (role === "student") {
                showMessage("loginMessage", "Student login successful!", "success");
                setTimeout(() => window.location.replace("dashboard.html"), 300);
                return;
            }

            throw new Error("Invalid user role specified.");
        } catch (error) {
            console.error("LOGIN ERROR:", error);
            let message = error.message || "Login failed. Please check credentials.";
            showMessage("loginMessage", message, "error");
        }
    });
}

// ==========================================
// REGISTER LOGIC (STUDENT)
// ==========================================
const registerForm = $("registerForm");
if (registerForm) {
    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const name = $("registerName").value.trim();
        const regNo = $("registerRegNo").value.trim();
        const email = $("registerEmail").value.trim();
        const password = $("registerPassword").value;
        const course = $("registerCourse").value;
        const year = $("registerYear").value;

        if (!name || !regNo || !email || !password || !course || !year) {
            showMessage("registerMessage", "Please fill all fields.", "error");
            return;
        }

        if (!registeredFaceDescriptor) {
            showMessage("registerMessage", "Please capture your face before creating account.", "error");
            return;
        }

        const registerButton = $("registerButton");
        if (registerButton) {
            registerButton.disabled = true;
            registerButton.textContent = "Creating Account...";
        }

        try {
            const regQuery = await db.collection("users").where("regNo", "==", regNo).limit(1).get();
            if (!regQuery.empty) throw new Error("Register number already exists.");

            const credential = await auth.createUserWithEmailAndPassword(email, password);
            const uid = credential.user.uid;

            await db.collection("users").doc(uid).set({
                uid: uid,
                name: name,
                regNo: regNo,
                email: email,
                course: course,
                year: year,
                role: "student",
                faceDescriptor: Array.from(registeredFaceDescriptor),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            showMessage("registerMessage", "Account created successfully!", "success");
            setTimeout(() => window.location.href = "dashboard.html", 1000);
        } catch (error) {
            showMessage("registerMessage", error.message || "Registration failed.", "error");
        } finally {
            if (registerButton) {
                registerButton.disabled = false;
                registerButton.textContent = "Create Account";
            }
        }
    });
}

// ==========================================
// REGISTER CAMERA & FACE CAPTURE
// ==========================================
const startRegisterCamera = $("startRegisterCamera");
if (startRegisterCamera) {
    startRegisterCamera.addEventListener("click", async function () {
        const video = $("registerVideo");
        if (!video) return;

        try {
            showMessage("faceMessage", "Loading face recognition...", "info");
            const loaded = await loadFaceModels();
            if (!loaded) throw new Error("Could not load face recognition models.");

            registerStream = await startCamera(video);
            startRegisterCamera.style.display = "none";
            if ($("captureFace")) $("captureFace").style.display = "block";

            showMessage("faceMessage", "Camera ready. Look at camera & capture face.", "success");
        } catch (error) {
            showMessage("faceMessage", error.message || "Could not open camera.", "error");
        }
    });
}

const captureFace = $("captureFace");
if (captureFace) {
    captureFace.addEventListener("click", async function () {
        const video = $("registerVideo");
        if (!video) return;

        try {
            captureFace.disabled = true;
            showMessage("faceMessage", "Detecting face...", "info");
            registeredFaceDescriptor = await getFaceDescriptor(video);
            showMessage("faceMessage", "Face captured successfully ✓", "success");
            captureFace.textContent = "Face Captured ✓";
        } catch (error) {
            registeredFaceDescriptor = null;
            showMessage("faceMessage", error.message || "Face capture failed.", "error");
        } finally {
            captureFace.disabled = false;
        }
    });
}

// ==========================================
// AUTH STATE ROUTING (UPDATED & FIXED)
// ==========================================
auth.onAuthStateChanged(async function (user) {
    let page = window.location.pathname.split("/").pop().toLowerCase();

    if (!page || page === "") page = "index.html";

    if (!user) {
        if (page === "dashboard.html" || page === "admin.html") {
            window.location.replace("index.html");
        }
        return;
    }

    try {
        const doc = await db.collection("users").doc(user.uid).get();
        if (!doc.exists) return;

        currentUserData = doc.data();
        const role = String(currentUserData.role || "").trim().toLowerCase();

        if (page === "index.html") {
            if (role === "admin") {
                window.location.replace("admin.html");
            } else if (role === "student") {
                window.location.replace("dashboard.html");
            }
            return;
        }

        if (page === "dashboard.html") {
            if (role === "admin") {
                window.location.replace("admin.html");
                return;
            }
            if (role !== "student") {
                await auth.signOut();
                window.location.replace("index.html");
                return;
            }
            loadStudentDashboard();
        }

        if (page === "admin.html") {
            if (role !== "admin") {
                window.location.replace("dashboard.html");
                return;
            }
            loadAdminDashboard();
        }
    } catch (error) {
        console.error("Auth state error:", error);
    }
});

// ==========================================
// DASHBOARD & ATTENDANCE LOGIC
// ==========================================
async function loadStudentDashboard() {
    if (!currentUserData) return;
    if ($("studentHeaderName")) $("studentHeaderName").textContent = currentUserData.name || "Student";
    if ($("welcomeName")) $("welcomeName").textContent = `Welcome ${currentUserData.name || "Student"} 👋`;
    if ($("studentName")) $("studentName").textContent = currentUserData.name || "-";
    if ($("studentRegNo")) $("studentRegNo").textContent = currentUserData.regNo || "-";
    if ($("studentEmail")) $("studentEmail").textContent = currentUserData.email || "-";
    if ($("studentCourse")) $("studentCourse").textContent = currentUserData.course || "-";
    if ($("studentYear")) $("studentYear").textContent = currentUserData.year || "-";

    await loadStudentAttendance();
}

async function loadStudentAttendance() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const snapshot = await db.collection("attendance").where("uid", "==", user.uid).get();
        const records = [];
        snapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() }));

        records.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

        const total = records.length;
        const present = records.filter(record => record.status === "Present").length;
        const percentage = total === 0 ? 0 : Math.round((present / total) * 100);

        if ($("attendancePercentage")) $("attendancePercentage").textContent = percentage + "%";
        if ($("totalDays")) $("totalDays").textContent = total;

        if ($("attendanceWarning")) {
            if (percentage < 75 && total > 0) {
                $("attendanceWarning").style.display = "block";
            } else {
                $("attendanceWarning").style.display = "none";
            }
        }

        const today = todayDate();
        const todayRecord = records.find(record => record.date === today);

        if ($("todayStatus")) {
            if (todayRecord) {
                $("todayStatus").textContent = todayRecord.status;
                $("todayStatus").className = "status-badge " + (todayRecord.status === "Present" ? "present" : "absent");
            } else {
                $("todayStatus").textContent = "Not Marked";
                $("todayStatus").className = "status-badge pending";
            }
        }
        renderStudentAttendanceTable(records);
        renderStudentCalendar(records);
    } catch (error) {
        console.error(error);
    }
}

function renderStudentAttendanceTable(records) {
    const body = $("attendanceTableBody");
    if (!body) return;

    if (records.length === 0) {
        body.innerHTML = `<tr><td colspan="3">No attendance records found.</td></tr>`;
        return;
    }

    body.innerHTML = records.slice(0, 30).map(record => `
        <tr>
            <td>${escapeHtml(record.date || "-")}</td>
            <td><span class="status-badge ${record.status === "Present" ? "present" : "absent"}">${escapeHtml(record.status || "-")}</span></td>
            <td>${formatTime(record.markedAt)}</td>
        </tr>
    `).join("");
}

function renderStudentCalendar(records) {
    const calendarEl = $("calendar");
    if (!calendarEl || typeof FullCalendar === "undefined") return;

    const events = records.map(r => ({
        title: r.status,
        start: r.date,
        color: r.status === "Present" ? "#28a745" : "#dc3545"
    }));

    if (studentCalendarInstance) {
        studentCalendarInstance.destroy();
    }

    studentCalendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: "dayGridMonth",
        events: events
    });
    studentCalendarInstance.render();
}

if ($("openFaceScanner")) $("openFaceScanner").addEventListener("click", openAttendanceScanner);
if ($("closeFaceScanner")) $("closeFaceScanner").addEventListener("click", closeAttendanceScanner);

async function openAttendanceScanner() {
    const modal = $("faceScannerModal");
    const video = $("attendanceVideo");
    if (!modal || !video) return;

    modal.classList.add("show");
    try {
        showMessage("scannerMessage", "Loading face recognition...", "info");
        const loaded = await loadFaceModels();
        if (!loaded) throw new Error("Face recognition models could not be loaded.");
        attendanceStream = await startCamera(video);
        showMessage("scannerMessage", "Camera ready. Look at the camera.", "success");
    } catch (error) {
        showMessage("scannerMessage", error.message || "Camera could not be opened.", "error");
    }
}

function closeAttendanceScanner() {
    stopCamera(attendanceStream);
    attendanceStream = null;
    if ($("attendanceVideo")) $("attendanceVideo").srcObject = null;
    if ($("faceScannerModal")) $("faceScannerModal").classList.remove("show");
}

if ($("verifyFaceBtn")) $("verifyFaceBtn").addEventListener("click", verifyStudentFace);

async function verifyStudentFace() {
    const user = auth.currentUser;
    if (!user || !currentUserData) {
        showMessage("scannerMessage", "Please login again.", "error");
        return;
    }

    try {
        $("verifyFaceBtn").disabled = true;
        $("verifyFaceBtn").textContent = "Verifying...";

        const today = todayDate();
        const attendanceId = `${user.uid}_${today}`;
        const existing = await db.collection("attendance").doc(attendanceId).get();

        if (existing.exists) {
            showMessage("scannerMessage", "Attendance already marked for today.", "info");
            return;
        }

        if (!currentUserData.faceDescriptor || !Array.isArray(currentUserData.faceDescriptor)) {
            throw new Error("Face data not found. Please contact admin.");
        }

        const video = $("attendanceVideo");
        const liveDescriptor = await getFaceDescriptor(video);
        const savedDescriptor = new Float32Array(currentUserData.faceDescriptor);

        const distance = faceapi.euclideanDistance(liveDescriptor, savedDescriptor);
        if (distance > 0.55) {
            throw new Error("Face does not match. Please try again.");
        }

        await db.collection("attendance").doc(attendanceId).set({
            uid: user.uid,
            studentName: currentUserData.name,
            regNo: currentUserData.regNo,
            course: currentUserData.course,
            date: today,
            status: "Present",
            markedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showMessage("scannerMessage", "Face verified! Attendance marked ✓", "success");
        setTimeout(async () => {
            closeAttendanceScanner();
            await loadStudentAttendance();
        }, 1200);
    } catch (error) {
        showMessage("scannerMessage", error.message || "Face verification failed.", "error");
    } finally {
        $("verifyFaceBtn").disabled = false;
        $("verifyFaceBtn").textContent = "Verify Face & Mark Attendance";
    }
}

// ==========================================
// LOGOUT & ADMIN LOGIC
// ==========================================
if ($("logoutBtn")) $("logoutBtn").addEventListener("click", () => auth.signOut().then(() => window.location.replace("index.html")));
if ($("adminLogoutBtn")) $("adminLogoutBtn").addEventListener("click", () => auth.signOut().then(() => window.location.replace("index.html")));

let allStudents = [];
async function loadAdminDashboard() {
    if (!currentUserData) return;
    if ($("adminHeaderName")) $("adminHeaderName").textContent = currentUserData.name || "Administrator";
    if ($("attendanceDate")) $("attendanceDate").value = todayDate();

    await loadStudents();
    await loadDateAttendance(todayDate());
}

async function loadStudents() {
    try {
        const snapshot = await db.collection("users").where("role", "in", ["student", "Student"]).get();
        allStudents = [];
        snapshot.forEach(doc => allStudents.push({ id: doc.id, ...doc.data() }));

        allStudents.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        if ($("totalStudents")) $("totalStudents").textContent = allStudents.length;
        renderStudents(allStudents);
    } catch (error) {
        console.error(error);
    }
}

function renderStudents(students) {
    const body = $("studentsTableBody");
    if (!body) return;

    if (students.length === 0) {
        body.innerHTML = `<tr><td colspan="6">No students found.</td></tr>`;
        return;
    }

    body.innerHTML = students.map(student => `
        <tr>
            <td>${escapeHtml(student.regNo || "-")}</td>
            <td>${escapeHtml(student.name || "-")}</td>
            <td>${escapeHtml(student.email || "-")}</td>
            <td>${escapeHtml(student.course || "-")}</td>
            <td>${escapeHtml(student.year || "-")}</td>
            <td>
                <button class="table-btn edit-btn" onclick="openEditStudent('${student.id}')">Edit</button>
                <button class="table-btn delete-btn" onclick="deleteStudent('${student.id}')">Delete</button>
            </td>
        </tr>
    `).join("");
}

if ($("studentSearch")) {
    $("studentSearch").addEventListener("input", function () {
        const search = this.value.trim().toLowerCase();
        if (!search) return renderStudents(allStudents);
        const filtered = allStudents.filter(student =>
            String(student.name || "").toLowerCase().includes(search) ||
            String(student.regNo || "").toLowerCase().includes(search) ||
            String(student.email || "").toLowerCase().includes(search)
        );
        renderStudents(filtered);
    });
}

if ($("loadAttendanceBtn")) {
    $("loadAttendanceBtn").addEventListener("click", async function () {
        const date = $("attendanceDate").value;
        if (date) await loadDateAttendance(date);
    });
}

if ($("exportExcelBtn")) {
    $("exportExcelBtn").addEventListener("click", function () {
        const table = $("adminAttendanceBody") ? $("adminAttendanceBody").parentElement : null;
        if (!table || typeof XLSX === "undefined") return;

        const wb = XLSX.utils.table_to_book(table, { sheet: "Attendance" });
        const currentDate = $("attendanceDate") ? $("attendanceDate").value : todayDate();
        XLSX.writeFile(wb, `Attendance_${currentDate}.xlsx`);
    });
}

async function loadDateAttendance(date) {
    const body = $("adminAttendanceBody");
    if (!body) return;

    try {
        const snapshot = await db.collection("attendance").where("date", "==", date).get();
        const records = [];
        snapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() }));

        let presentCount = 0;
        body.innerHTML = allStudents.map(student => {
            const record = records.find(item => item.uid === student.id);
            const status = record ? record.status : "Absent";
            if (status === "Present") presentCount++;

            return `
                <tr>
                    <td>${escapeHtml(student.regNo || "-")}</td>
                    <td>${escapeHtml(student.name || "-")}</td>
                    <td>${escapeHtml(student.course || "-")}</td>
                    <td><span class="status-badge ${status === "Present" ? "present" : "absent"}">${escapeHtml(status)}</span></td>
                    <td>${record ? formatTime(record.markedAt) : "-"}</td>
                    <td>${record ? `<button class="table-btn delete-btn" onclick="deleteAttendance('${record.id}')">Delete</button>` : "-"}</td>
                </tr>
            `;
        }).join("");

        const absentCount = Math.max(0, allStudents.length - presentCount);

        if (date === todayDate()) {
            if ($("presentToday")) $("presentToday").textContent = presentCount;
            if ($("absentToday")) $("absentToday").textContent = absentCount;
        }

        renderAttendanceChart(presentCount, absentCount);
    } catch (error) {
        console.error(error);
    }
}

function renderAttendanceChart(present, absent) {
    const ctx = $("attendanceChart");
    if (!ctx || typeof Chart === "undefined") return;

    if (attendanceChartInstance) {
        attendanceChartInstance.destroy();
    }

    attendanceChartInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Present", "Absent"],
            datasets: [{
                data: [present, absent],
                backgroundColor: ["#28a745", "#dc3545"]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: "bottom" }
            }
        }
    });
}

async function deleteAttendance(attendanceId) {
    if (!confirm("Delete this attendance record?")) return;
    try {
        await db.collection("attendance").doc(attendanceId).delete();
        await loadDateAttendance($("attendanceDate").value || todayDate());
    } catch (error) {
        alert("Unable to delete attendance.");
    }
}
window.deleteAttendance = deleteAttendance;

function openEditStudent(uid) {
    const student = allStudents.find(item => item.id === uid);
    if (!student) return;

    $("editStudentUid").value = uid;
    $("editName").value = student.name || "";
    $("editRegNo").value = student.regNo || "";
    $("editCourse").value = student.course || "";
    $("editYear").value = student.year || "";

    if ($("editStudentModal")) $("editStudentModal").classList.add("show");
}
window.openEditStudent = openEditStudent;

if ($("closeEditModal")) {
    $("closeEditModal").addEventListener("click", () => {
        if ($("editStudentModal")) $("editStudentModal").classList.remove("show");
    });
}

if ($("editStudentForm")) {
    $("editStudentForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        const uid = $("editStudentUid").value;
        try {
            await db.collection("users").doc(uid).update({
                name: $("editName").value.trim(),
                regNo: $("editRegNo").value.trim(),
                course: $("editCourse").value,
                year: $("editYear").value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await loadStudents();
            if ($("editStudentModal")) $("editStudentModal").classList.remove("show");
        } catch (error) {
            showMessage("editMessage", "Unable to update student.", "error");
        }
    });
}

async function deleteStudent(uid) {
    if (!confirm("Delete this student profile?")) return;
    try {
        await db.collection("users").doc(uid).delete();
        await loadStudents();
    } catch (error) {
        alert("Unable to delete profile.");
    }
}
window.deleteStudent = deleteStudent;
