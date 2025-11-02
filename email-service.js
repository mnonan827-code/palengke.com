// Email Service Configuration
// REPLACE THESE WITH YOUR ACTUAL EMAILJS CREDENTIALS
const EMAIL_CONFIG = {
    serviceId: 'service_kmbhxwd',     // Replace with your Service ID from Step 2
    templateId: 'template_nmuqtvr',   // Replace with your Template ID from Step 3
    publicKey: 'W9t0FVxxE5r6HqbFN'   // Replace with your Public Key from Step 4
};

// Initialize EmailJS when page loads
(function() {
    emailjs.init(EMAIL_CONFIG.publicKey);
})();

// Send verification code email
window.sendVerificationCodeEmail = async function(toEmail, toName, verificationCode) {
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

export { sendVerificationCodeEmail };