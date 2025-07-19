import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged, sendPasswordResetEmail, RecaptchaVerifier, signInWithPhoneNumber, sendEmailVerification } from 'firebase/auth';
import { app } from './config'; // adjust if your firebase app export is named differently

const auth = getAuth(app);

// Register a new user
export async function signUp(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user };
  } catch (error) {
    let message = 'Registration failed.';
    if (error.code === 'auth/email-already-in-use') message = 'Email already in use.';
    if (error.code === 'auth/invalid-email') message = 'Invalid email address.';
    if (error.code === 'auth/weak-password') message = 'Password is too weak.';
    return { error: message };
  }
}

// Log in an existing user
export async function signIn(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user };
  } catch (error) {
    let message = 'Login failed.';
    if (error.code === 'auth/user-not-found') message = 'User not found.';
    if (error.code === 'auth/wrong-password') message = 'Wrong password.';
    if (error.code === 'auth/invalid-email') message = 'Invalid email address.';
    return { error: message };
  }
}

// Log out the current user
export async function signOut() {
  try {
    await fbSignOut(auth);
    return { success: true };
  } catch (error) {
    return { error: 'Sign out failed.' };
  }
}

// Send password reset email
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (error) {
    let message = 'Password reset failed.';
    if (error.code === 'auth/user-not-found') message = 'User not found.';
    if (error.code === 'auth/invalid-email') message = 'Invalid email address.';
    return { error: message };
  }
}

// Listen for auth state changes
export function onAuthStateChangedListener(callback) {
  return onAuthStateChanged(auth, callback);
}

// --- PHONE AUTHENTICATION ---

// Set up reCAPTCHA for phone auth
export function setupRecaptcha(containerId = 'recaptcha-container') {
  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new RecaptchaVerifier(containerId, {
      size: 'invisible',
      callback: () => {},
    }, auth);
  }
  return window.recaptchaVerifier;
}

// Sign up or sign in with phone number
export async function signInWithPhone(phoneNumber, appVerifier) {
  try {
    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
    return { confirmationResult };
  } catch (error) {
    return { error: error.message };
  }
}

// Confirm phone code
export async function confirmPhoneCode(confirmationResult, code) {
  try {
    const result = await confirmationResult.confirm(code);
    return { user: result.user };
  } catch (error) {
    return { error: error.message };
  }
}

// Send email verification
export async function sendVerificationEmail(user) {
  try {
    await sendEmailVerification(user);
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}
