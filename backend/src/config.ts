export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  geminiApiKeys: (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean),
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
  clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
  demoMode: process.env.DEMO_MODE === 'true',
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'ap-south-1',
  },
  s3Bucket: process.env.S3_BUCKET || 'tryonai-media',
  cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN || '',
  dynamoTable: process.env.DYNAMODB_TABLE || 'TryOnSessions',
};
