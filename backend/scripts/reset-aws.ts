import 'dotenv/config';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

const region = process.env.AWS_REGION || 'ap-south-1';
const bucket = process.env.S3_BUCKET || 'tryonai-media';
const table = process.env.DYNAMODB_TABLE || 'TryOnSessions';

const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const ddb = new DynamoDBClient({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function nukeS3() {
  console.log(`\n🗑️  Deleting all objects from s3://${bucket} ...`);
  let total = 0;
  let token: string | undefined;

  do {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: token,
    }));

    const objects = list.Contents || [];
    if (objects.length === 0) break;

    await s3.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: objects.map(o => ({ Key: o.Key! })) },
    }));

    total += objects.length;
    token = list.NextContinuationToken;
    console.log(`   deleted ${total} objects...`);
  } while (token);

  console.log(`✅ S3 reset complete — ${total} objects deleted`);
}

async function nukeDynamo() {
  console.log(`\n🗑️  Deleting all items from DynamoDB table ${table} ...`);
  let total = 0;
  let lastKey: any;

  do {
    const scan = await ddb.send(new ScanCommand({
      TableName: table,
      ProjectionExpression: 'deviceId, sessionId',
      ExclusiveStartKey: lastKey,
    }));

    const items = scan.Items || [];
    if (items.length === 0) break;

    for (const item of items) {
      await ddb.send(new DeleteItemCommand({
        TableName: table,
        Key: {
          deviceId: item.deviceId,
          sessionId: item.sessionId,
        },
      }));
      total++;
    }

    lastKey = scan.LastEvaluatedKey;
    console.log(`   deleted ${total} items...`);
  } while (lastKey);

  console.log(`✅ DynamoDB reset complete — ${total} items deleted`);
}

async function main() {
  console.log('🔄 TryOnAI AWS Reset');
  console.log('====================');
  await nukeS3();
  await nukeDynamo();
  console.log('\n🎉 All clean! Ready for fresh testing.');
}

main().catch(err => {
  console.error('❌ Reset failed:', err);
  process.exit(1);
});
