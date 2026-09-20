// Firebase SDK Import
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// உங்கள் Firebase Configuration Details
const firebaseConfig = {
  apiKey: "AIzaSyDyuQydwnclYeNlCdum0LSgBXdCMZw-X_4",
  authDomain: "student-management-syste-738df.firebaseapp.com",
  projectId: "student-management-syste-738df",
  storageBucket: "student-management-syste-738df.firebasestorage.app",
  messagingSenderId: "116617400146",
  appId: "1:116617400146:web:9e1036f9f5dcf1ebb2348b",
  measurementId: "G-VSZ1TMJCWV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const loginForm = document.getElementById("loginForm");
const message = document.getElementById("message");

loginForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (email === "" || password === "") {
        message.innerText = "Please enter email and password";
        message.style.color = "red";
        return;
    }

    message.innerText = "Logging in...";
    message.style.color = "blue";

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        message.innerText = "Login successful!";
        message.style.color = "green";
        
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1000);

    } catch (error) {
        message.innerText = "Error: " + error.message;
        message.style.color = "red";
    }
});
