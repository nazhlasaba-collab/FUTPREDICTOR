// auth.js - Gestión de autenticación
import { loginUser, registerUser, logoutUser, validateEmail } from './supabaseClient.js';

// Variables globales
let currentForm = 'login';

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', () => {
    initAuthPage();
    checkRedirect();
});

// Verificar si ya hay sesión activa
async function checkRedirect() {
    const session = localStorage.getItem('userSession');
    if (session) {
        const user = JSON.parse(session);
        redirectBasedOnRole(user.rol);
    }
}

// Inicializar página de autenticación
function initAuthPage() {
    // Event listeners para tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.tab;
            switchTab(tab);
        });
    });

    // Formulario de login
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Formulario de registro
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
}

// Cambiar entre tabs
function switchTab(tab) {
    currentForm = tab;
    
    // Actualizar botones
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Actualizar formularios
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.toggle('active', form.id === `${tab}Form`);
    });
    
    // Limpiar errores
    clearErrors();
}

// Manejar login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    const errorDiv = document.getElementById('loginError');
    
    // Validaciones
    if (!validateEmail(email)) {
        showError(errorDiv, 'Por favor, ingresa un email válido');
        return;
    }
    
    if (password.length < 6) {
        showError(errorDiv, 'La contraseña debe tener al menos 6 caracteres');
        return;
    }
    
    // Mostrar loading
    showLoading();
    
    try {
        const result = await loginUser(email, password);
        
        if (result.success) {
            if (rememberMe) {
                localStorage.setItem('rememberedEmail', email);
            }
            
            showSuccess('¡Bienvenido! Redirigiendo...');
            
            setTimeout(() => {
                redirectBasedOnRole(result.rol);
            }, 1000);
        } else {
            showError(errorDiv, result.error);
        }
    } catch (error) {
        showError(errorDiv, 'Error al iniciar sesión. Intenta de nuevo.');
    } finally {
        hideLoading();
    }
}

// Manejar registro
async function handleRegister(e) {
    e.preventDefault();
    
    const nombre = document.getElementById('regNombre').value;
    const apellido = document.getElementById('regApellido').value;
    const email = document.getElementById('regEmail').value;
    const telefono = document.getElementById('regTelefono').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const termsCheck = document.getElementById('termsCheck').checked;
    const errorDiv = document.getElementById('registerError');
    
    // Validaciones
    if (!nombre || !apellido || !email || !telefono) {
        showError(errorDiv, 'Todos los campos son obligatorios');
        return;
    }
    
    if (!validateEmail(email)) {
        showError(errorDiv, 'Por favor, ingresa un email válido');
        return;
    }
    
    if (password.length < 6) {
        showError(errorDiv, 'La contraseña debe tener al menos 6 caracteres');
        return;
    }
    
    if (password !== confirmPassword) {
        showError(errorDiv, 'Las contraseñas no coinciden');
        return;
    }
    
    if (!termsCheck) {
        showError(errorDiv, 'Debes aceptar los términos y condiciones');
        return;
    }
    
    // Mostrar loading
    showLoading();
    
    try {
        const result = await registerUser(email, password, {
            nombre,
            apellido,
            telefono
        });
        
        if (result.success) {
            showSuccess('¡Registro exitoso! Ya puedes iniciar sesión');
            document.getElementById('registerForm').reset();
            switchTab('login');
            
            // Autocompletar email en login
            document.getElementById('loginEmail').value = email;
        } else {
            showError(errorDiv, result.error);
        }
    } catch (error) {
        showError(errorDiv, 'Error al registrar usuario. Intenta de nuevo.');
    } finally {
        hideLoading();
    }
}

// Redirigir según rol
function redirectBasedOnRole(rol) {
    if (rol === 'admin') {
        window.location.href = 'pages/admin.html';
    } else {
        window.location.href = 'pages/dashboard.html';
    }
}

// Mostrar error
function showError(element, message) {
    element.textContent = message;
    element.classList.add('active');
}

// Limpiar errores
function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
        el.classList.remove('active');
    });
}

// Mostrar loading
function showLoading() {
    const loading = document.createElement('div');
    loading.id = 'globalLoading';
    loading.className = 'loading active';
    loading.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(loading);
}

// Ocultar loading
function hideLoading() {
    const loading = document.getElementById('globalLoading');
    if (loading) {
        loading.remove();
    }
}

// Mostrar notificación de éxito
function showSuccess(message) {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.innerHTML = `
        <i class="fas fa-check-circle"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
}

// Funciones globales
window.togglePassword = function(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};

window.showForgotPassword = function() {
    alert('Para recuperar tu contraseña, contacta al administrador.');
};

window.showTerms = function() {
    alert('Términos y Condiciones del servicio de apuestas.');
};

// Exportar funciones
export { switchTab, clearErrors };