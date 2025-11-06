// Email Service Configuration
const EMAIL_CONFIG = {
    serviceId: 'service_kmbhxwd',
    templateId: 'template_nmuqtvr',
    resetTemplateId: 'template_4av8o1v', // ← UPDATE THIS with your new template ID
    publicKey: 'W9t0FVxxE5r6HqbFN'
};

// Initialize EmailJS when page loads
window.addEventListener('DOMContentLoaded', function() {
    if (typeof emailjs !== 'undefined') {
        emailjs.init(EMAIL_CONFIG.publicKey);
        console.log('EmailJS initialized successfully');
    } else {
        console.error('EmailJS library not loaded');
    }
});

// Send verification code email
window.sendVerificationCodeEmail = async function(toEmail, toName, verificationCode) {
    if (typeof emailjs === 'undefined') {
        console.error('EmailJS not loaded');
        throw new Error('Email service not available. Please refresh the page.');
    }

    try {
        const templateParams = {
            to_email: toEmail,
            to_name: toName,
            verification_code: verificationCode
        };

        console.log('Sending email to:', toEmail);
        
        const response = await emailjs.send(
            EMAIL_CONFIG.serviceId,
            EMAIL_CONFIG.templateId,
            templateParams
        );

        console.log('Email sent successfully:', response.status, response.text);
        return true;
    } catch (error) {
        console.error('Email send failed:', error);
        throw new Error('Failed to send verification email. Please try again.');
    }
};

// ✅ NEW: Send password reset code email
window.sendPasswordResetEmail = async function(toEmail, toName, resetCode) {
    if (typeof emailjs === 'undefined') {
        console.error('EmailJS not loaded');
        throw new Error('Email service not available. Please refresh the page.');
    }

    try {
        const templateParams = {
            to_email: toEmail,
            to_name: toName,
            reset_code: resetCode
        };

        console.log('Sending password reset email to:', toEmail);
        
        const response = await emailjs.send(
            EMAIL_CONFIG.serviceId,
            EMAIL_CONFIG.resetTemplateId, // ← Uses the password reset template
            templateParams
        );

        console.log('Password reset email sent successfully:', response.status);
        return true;
    } catch (error) {
        console.error('Password reset email failed:', error);
        throw new Error('Failed to send password reset email. Please try again.');
    }
};