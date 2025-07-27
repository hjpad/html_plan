// scripts/auth.js

// Import Firebase config (ensure firebaseConfig.js is loaded before this script)
// Assuming firebaseConfig is globally available after firebaseConfig.js loads.
// For modular JS, you'd typically export from firebaseConfig.js, but since it's simple setup,
// we'll rely on it being global after the script tag.
// If you encounter "firebase is not defined", ensure firebase-app-compat.js loads first in HTML.

const auth = firebase.auth();
let onAuthStateChangedCallback = null; // Store the callback from plan.js

// Initialize Auth and set up listener
export function initAuth(callback) {
    onAuthStateChangedCallback = callback;
    auth.onAuthStateChanged(user => {
        if (onAuthStateChangedCallback) {
            onAuthStateChangedCallback(user);
        }
    });
}

export async function loginUser(email, password) {
    const loginMessage = document.getElementById('loginMessage');
    try {
        await auth.signInWithEmailAndPassword(email, password);
        loginMessage.textContent = ''; // Clear message on success
        loginMessage.classList.remove('text-danger');
    } catch (error) {
        let errorMessage = 'Login failed. Please check your credentials.';
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No user found with this email.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password.';
        } else if (error.code === 'auth/invalid-email') {
             errorMessage = 'Invalid email address format.';
        }
        console.error("Login error:", error.message);
        loginMessage.textContent = errorMessage;
        loginMessage.classList.add('text-danger');
        throw error; // Re-throw to allow calling code to catch
    }
}

export async function registerUser(email, password) {
    const loginMessage = document.getElementById('loginMessage');
    loginMessage.textContent = '';

    if (!email || !password) {
        loginMessage.textContent = 'Please enter both email and password to register.';
        loginMessage.classList.add('text-danger');
        throw new Error('Email or password missing.');
    }
    if (password.length < 6) {
        loginMessage.textContent = 'Password must be at least 6 characters long.';
        loginMessage.classList.add('text-danger');
        throw new Error('Weak password.');
    }

    try {
        await auth.createUserWithEmailAndPassword(email, password);
        loginMessage.textContent = 'Registration successful! You are now logged in.';
        loginMessage.classList.remove('text-danger');
        loginMessage.classList.add('text-success');
    } catch (error) {
        let errorMessage = 'Registration failed.';
         if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered. Try logging in or use a different email.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak (min 6 characters).';
        } else if (error.code === 'auth/invalid-email') {
             errorMessage = 'Invalid email address format.';
        }
        console.error("Registration error:", error.message);
        loginMessage.textContent = errorMessage;
        loginMessage.classList.add('text-danger');
        throw error; // Re-throw
    }
}

export async function logoutUser() {
    try {
        await auth.signOut();
    } catch (error) {
        console.error("Logout error:", error.message);
        alert("Failed to logout: " + error.message);
        throw error; // Re-throw
    }
}

export { auth }; // Export auth instance if needed by other modules