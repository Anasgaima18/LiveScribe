import nodemailer from 'nodemailer';
import logger from '../config/logger.js';

// Create reusable transporter
const createTransporter = () => {
  if (process.env.NODE_ENV === 'production') {
    // Production: Use real email service (e.g., SendGrid, Gmail, etc.)
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  } else {
    // Development: Use Ethereal for testing
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: process.env.ETHEREAL_EMAIL || 'ethereal.user@ethereal.email',
        pass: process.env.ETHEREAL_PASSWORD || 'ethereal.pass'
      }
    });
  }
};

// Send email function
export const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'LiveKit Video Call'} <${process.env.EMAIL_FROM || 'noreply@livekit-video.com'}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };

    const info = await transporter.sendMail(mailOptions);

    logger.info('Email sent successfully', {
      messageId: info.messageId,
      to: options.to,
      subject: options.subject
    });

    if (process.env.NODE_ENV !== 'production') {
      logger.info('Preview URL: ' + nodemailer.getTestMessageUrl(info));
    }

    return info;
  } catch (error) {
    logger.error('Error sending email:', error);
    throw error;
  }
};

// Welcome email template
export const sendWelcomeEmail = async (user) => {
  const subject = 'Welcome to LiveKit Video Call!';
  const text = `Hi ${user.name},\n\nWelcome to LiveKit Video Call! We're excited to have you on board.\n\nYou can now:\n- Connect with other users\n- Start video calls\n- Use transcription features\n- Generate AI summaries\n\nGet started by logging in to your account.\n\nBest regards,\nThe LiveKit Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #667eea;">Welcome to LiveKit Video Call!</h2>
      <p>Hi ${user.name},</p>
      <p>We're excited to have you on board!</p>
      <h3>What you can do:</h3>
      <ul>
        <li>✅ Connect with other users</li>
        <li>✅ Start video calls</li>
        <li>✅ Use transcription features</li>
        <li>✅ Generate AI summaries</li>
      </ul>
      <p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" 
           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; 
                  padding: 12px 24px; 
                  text-decoration: none; 
                  border-radius: 6px;
                  display: inline-block;
                  margin-top: 10px;">
          Get Started
        </a>
      </p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        Best regards,<br>
        The LiveKit Team
      </p>
    </div>
  `;

  await sendEmail({
    to: user.email,
    subject,
    text,
    html
  });
};

// Password reset email template
export const sendPasswordResetEmail = async (user, resetToken) => {
  const resetURL = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
  
  const subject = 'Password Reset Request';
  const text = `Hi ${user.name},\n\nYou requested a password reset.\n\nClick the link below to reset your password:\n${resetURL}\n\nThis link will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nThe LiveKit Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #667eea;">Password Reset Request</h2>
      <p>Hi ${user.name},</p>
      <p>You requested a password reset for your LiveKit Video Call account.</p>
      <p>Click the button below to reset your password:</p>
      <p>
        <a href="${resetURL}" 
           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; 
                  padding: 12px 24px; 
                  text-decoration: none; 
                  border-radius: 6px;
                  display: inline-block;
                  margin-top: 10px;">
          Reset Password
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">
        This link will expire in <strong>10 minutes</strong>.
      </p>
      <p style="color: #666; font-size: 14px;">
        If you didn't request this, please ignore this email.
      </p>
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        Or copy and paste this URL into your browser:<br>
        ${resetURL}
      </p>
    </div>
  `;

  await sendEmail({
    to: user.email,
    subject,
    text,
    html
  });
};

// Call summary email
export const sendCallSummaryEmail = async (user, callData) => {
  const subject = `Call Summary - ${callData.roomId}`;
  const text = `Hi ${user.name},\n\nHere's the summary of your recent call:\n\nRoom: ${callData.roomId}\nDuration: ${callData.duration}\n\nSummary:\n${callData.summary}\n\nView full details in your dashboard.\n\nBest regards,\nThe LiveKit Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #667eea;">Call Summary</h2>
      <p>Hi ${user.name},</p>
      <p>Here's the summary of your recent call:</p>
      <div style="background: #f5f7fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Room:</strong> ${callData.roomId}</p>
        <p><strong>Duration:</strong> ${callData.duration}</p>
        <h3 style="color: #667eea;">Summary:</h3>
        <p>${callData.summary}</p>
      </div>
      <p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" 
           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; 
                  padding: 12px 24px; 
                  text-decoration: none; 
                  border-radius: 6px;
                  display: inline-block;">
          View Dashboard
        </a>
      </p>
    </div>
  `;

  await sendEmail({
    to: user.email,
    subject,
    text,
    html
  });
};

// Alert notification email
export const sendAlertEmail = async (user, alertData) => {
  const subject = '⚠️ Alert Detected in Call';
  const text = `Hi ${user.name},\n\nAn alert was detected during a call.\n\nSeverity: ${alertData.severity}\nFlagged Words: ${alertData.matchedWords.join(', ')}\nContext: ${alertData.context}\n\nPlease review this incident.\n\nBest regards,\nThe LiveKit Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ff4757;">⚠️ Alert Detected</h2>
      <p>Hi ${user.name},</p>
      <p>An alert was detected during a call:</p>
      <div style="background: #ffe5e5; border-left: 4px solid #ff4757; padding: 20px; margin: 20px 0;">
        <p><strong>Severity:</strong> <span style="color: #ff4757;">${alertData.severity.toUpperCase()}</span></p>
        <p><strong>Flagged Words:</strong> ${alertData.matchedWords.join(', ')}</p>
        <p><strong>Context:</strong> "${alertData.context}"</p>
      </div>
      <p style="color: #666;">Please review this incident in your dashboard.</p>
    </div>
  `;

  await sendEmail({
    to: user.email,
    subject,
    text,
    html
  });
};
