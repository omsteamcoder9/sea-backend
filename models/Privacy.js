import mongoose from 'mongoose';

const privacySectionSchema = new mongoose.Schema({
  number: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  }
});

const privacyPolicySchema = new mongoose.Schema({
  privacyPolicyTitle: {
    type: String,
    default: 'Privacy Policy',
    trim: true
  },
  privacyPolicyLastUpdated: {
    type: String,
    default: () => new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  },
  privacyIntroduction: {
    type: String,
    default: 'This Privacy Policy describes how we collect, use, and handle your personal information when you use our website and services.'
  },
  privacyDataCollection: [{
    type: String,
    default: [
      'Name and contact information (email, phone number, address)',
      'Account credentials (username, password)',
      'Payment information (processed securely by third-party providers)',
      'Order history and preferences',
      'Device information (IP address, browser type, operating system)',
      'Usage data (pages visited, time spent, interactions)'
    ]
  }],
  privacyDataUsage: [{
    type: String,
    default: [
      'Process and fulfill your orders',
      'Communicate with you about your account or orders',
      'Send you marketing communications (with your consent)',
      'Improve and optimize our website and services',
      'Detect and prevent fraud or security issues',
      'Comply with legal obligations'
    ]
  }],
  privacyDataSharing: [{
    type: String,
    default: [
      'Service providers (payment processors, shipping carriers, email services)',
      'Legal authorities (when required by law or to protect our rights)',
      'Business transfers (in case of merger, acquisition, or sale)',
      'Third-party analytics providers (Google Analytics, etc.)'
    ]
  }],
  privacyDataSecurity: {
    type: String,
    default: 'We implement appropriate technical and organizational measures to protect your personal information, including encryption, secure servers, access controls, and regular security assessments. However, no method of transmission over the Internet is 100% secure.'
  },
  privacyUserRights: [{
    type: String,
    default: [
      'Access your personal data',
      'Correct inaccurate or incomplete data',
      'Request deletion of your data',
      'Object to or restrict data processing',
      'Data portability',
      'Withdraw consent at any time'
    ]
  }],
  privacyCookies: {
    type: String,
    default: 'We use cookies and similar tracking technologies to enhance your browsing experience, analyze site traffic, and personalize content. You can control cookie settings through your browser preferences.'
  },
  privacyThirdPartyLinks: {
    type: String,
    default: 'Our website may contain links to third-party websites. We are not responsible for the privacy practices or content of these external sites. We encourage you to read their privacy policies.'
  },
  privacyPolicyChanges: {
    type: String,
    default: 'We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the "Last updated" date.'
  },
  privacyContactInfo: {
    type: String,
    default: 'If you have any questions about this Privacy Policy or our data practices, please contact us through the information provided in our website footer.'
  },
  privacySections: [privacySectionSchema],
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

const Privacy = mongoose.model('Privacy', privacyPolicySchema);
export default Privacy;