import dotenv from 'dotenv';
dotenv.config();

const TWO_FACTOR_BASE_URL = process.env.TWO_FACTOR_BASE_URL || 'https://2factor.in/API/V1';
const API_KEY = process.env.TWO_FACTOR_API_KEY; // Use from .env

export const sendOTP = async (phoneNumber) => {
  try {
    let cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length === 10) {
      cleanNumber = `91${cleanNumber}`;
    }
    
    // CRITICAL: Use SMS endpoint - NOT voice
    // Format: /API/V1/{API_KEY}/SMS/{phone}/AUTOGEN
    const url = `${TWO_FACTOR_BASE_URL}/${API_KEY}/SMS/${cleanNumber}/AUTOGEN`;
    
    console.log('Sending SMS OTP to:', cleanNumber);
    console.log('URL:', url.replace(API_KEY, 'HIDDEN')); // Don't expose API key in logs
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('2Factor API Response:', data);
    
    if (data.Status === 'Success') {
      return {
        success: true,
        otpSessionId: data.Details,
        message: 'SMS OTP sent successfully'
      };
    } else {
      return {
        success: false,
        message: data.Details || 'Failed to send SMS OTP'
      };
    }
  } catch (error) {
    console.error('Error sending SMS OTP:', error);
    return {
      success: false,
      message: 'Error sending SMS OTP: ' + error.message
    };
  }
};

export const verifyOTP = async (otpSessionId, otpCode) => {
  try {
    const url = `${TWO_FACTOR_BASE_URL}/${API_KEY}/SMS/VERIFY/${otpSessionId}/${otpCode}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.Status === 'Success') {
      return {
        success: true,
        message: 'OTP verified successfully'
      };
    } else {
      return {
        success: false,
        message: data.Details || 'Invalid OTP'
      };
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      message: 'Error verifying OTP'
    };
  }
};