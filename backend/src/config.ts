export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  appSecret: process.env.APP_SECRET || '',
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'ap-south-1',
  },
  s3Bucket: process.env.S3_BUCKET || 'tryonai-media',
  cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN || '',
  dynamoTable: process.env.DYNAMODB_TABLE || 'TryOnSessions',
};
