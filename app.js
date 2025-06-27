// app.js

// On importe les fonctions depuis la config firebase.
import { 
    auth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail,
    db,
    doc,
    setDoc
} from './firebase-config.js';

// On importe la fonction d'initialisation de notre application de récolte.
import { initHarvestApp } from './harvest.js';

// --- SÉLECTION DES ÉLÉMENTS DU DOM ---

// Conteneurs
const authContainer = document.getElementById('auth-container');
const mainContent = document.getElementById('main-content');

// Formulaires
const loginForm = document.getElementById('login');
const signupForm = document.getElementById('signup');
const loginContainer = document.getElementById('login-form');
const signupContainer = document.getElementById('signup-form');

// Liens pour basculer
const showSignupLink = document.getElementById('show-signup');
const showLoginLink = document.getElementById('show-login');
const forgotPasswordLink = document.getElementById('forgot-password-link');

// Messages d'erreur
const signupError = document.getElementById('signup-error');
const loginError = document.getElementById('login-error');

// Bouton de déconnexion
const logoutButton = document.getElementById('logout-btn');


// --- GESTION DE L'INTERFACE UTILISATEUR ---

showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginContainer.classList.add('hidden');
    signupContainer.classList.remove('hidden');
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    signupContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
});

forgotPasswordLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = loginForm['login-email'].value;
    
    // Réinitialise le style et cache le message
    loginError.classList.add('hidden');
    loginError.classList.remove('text-green-600');
    loginError.classList.add('text-red-500');

    if (!email) {
        loginError.textContent = "Veuillez saisir votre e-mail pour recevoir un lien de réinitialisation.";
        loginError.classList.remove('hidden');
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        // Affiche un message de succès en vert
        loginError.textContent = "E-mail de réinitialisation envoyé ! Veuillez vérifier votre boîte de réception.";
        loginError.classList.remove('text-red-500');
        loginError.classList.add('text-green-600');
        loginError.classList.remove('hidden');
    } catch (error) {
        console.error("Password reset error:", error);
        // Affiche un message d'erreur en rouge
        loginError.classList.remove('text-green-600');
        loginError.classList.add('text-red-500');
        loginError.textContent = "Erreur. L'e-mail est peut-être invalide ou n'existe pas.";
        loginError.classList.remove('hidden');
    }
});


// --- LOGIQUE D'AUTHENTIFICATION ---

// 1. Création de compte
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = signupForm['signup-name'].value;
    const email = signupForm['signup-email'].value;
    const password = signupForm['signup-password'].value;

    signupError.classList.add('hidden');

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        // Enregistrer les informations de l'utilisateur dans Firestore
        await setDoc(doc(db, "users", user.uid), {
            name: name,
            email: email
        });
        signupForm.reset();
    } catch (error) {
        console.error("Erreur d'inscription:", error.message);
        signupError.textContent = "L'adresse e-mail est peut-être déjà utilisée ou invalide.";
        signupError.classList.remove('hidden');
    }
});

// 2. Connexion de l'utilisateur
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginForm['login-email'].value;
    const password = loginForm['login-password'].value;
    
    // S'assure que le message d'erreur est caché et a le bon style au début
    loginError.classList.add('hidden');
    loginError.classList.remove('text-green-600');
    loginError.classList.add('text-red-500');

    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginForm.reset();
    } catch (error) {
        console.error("Erreur de connexion:", error.message);
        loginError.textContent = "Email ou mot de passe incorrect.";
        loginError.classList.remove('hidden');
    }
});

// 3. Déconnexion
logoutButton.addEventListener('click', async () => {
    try {
        await signOut(auth);
        // Le onAuthStateChanged s'occupera de rafraîchir l'interface.
    } catch (error) {
        console.error("Erreur de déconnexion:", error);
    }
});

// 4. Écouteur de l'état d'authentification
onAuthStateChanged(auth, (user) => {
    if (user) {
        // L'utilisateur est connecté
        console.log("Utilisateur connecté:", user.uid);
        authContainer.classList.add('hidden');
        mainContent.classList.remove('hidden');
        // On initialise l'application de suivi de récolte avec l'utilisateur actuel
        initHarvestApp(user);
    } else {
        // L'utilisateur est déconnecté
        console.log("Utilisateur déconnecté");
        authContainer.classList.remove('hidden');
        mainContent.classList.add('hidden');
    }
});