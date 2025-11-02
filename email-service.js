// Email Service Configuration
// REPLACE THESE WITH YOUR ACTUAL EMAILJS CREDENTIALS
const EMAIL_CONFIG = {
    serviceId: 'service_kmbhxwd',     // ← REPLACE with your Service ID
    templateId: 'template_nmuqtvr',   // ← REPLACE with your Template ID
    publicKey: 'W9t0FVxxE5r6HqbFN'     // ← REPLACE with your Public Key
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