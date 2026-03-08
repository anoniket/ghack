import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';

const s3 = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

const bucket = config.s3Bucket;

export function cdnUrl(s3Key: string): string {
  if (config.cloudfrontDomain) {
    return `https://${config.cloudfrontDomain}/${s3Key}`;
  }
  // Without CloudFront, raw S3 URLs won't work (bucket is private).
  // Use getReadUrl() instead for client-facing URLs.
  return `https://${bucket}.s3.${config.aws.region}.amazonaws.com/${s3Key}`;
}

// Generate a pre-signed GET URL (valid for 1 hour) so the client can read private objects
export async function getReadUrl(s3Key: string): Promise<string> {
  if (config.cloudfrontDomain) {
    return `https://${config.cloudfrontDomain}/${s3Key}`;
  }
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: s3Key,
  });
  return getSignedUrl(s3, command, { expiresIn: 86400 }); // 24 hours (until CloudFront is set up)
}

export async function uploadBuffer(
  s3Key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: body,
      ContentType: contentType,
    })
  );
  return cdnUrl(s3Key);
}

export async function getPresignedUploadUrl(
  s3Key: string,
  contentType: string,
  expiresIn: number = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function downloadToBuffer(s3Key: string): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    })
  );
  const stream = response.Body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function deleteObject(s3Key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    })
  );
}

/**
 * Delete up to 1000 S3 keys in a single API call.
 * For larger arrays, chunks are issued in parallel.
 * Returns any keys S3 reported as errored so the caller can decide what to do.
 */
export async function deleteObjects(s3Keys: string[]): Promise<string[]> {
  if (s3Keys.length === 0) return [];

  const CHUNK = 1000; // S3 hard limit per DeleteObjects call
  const chunks: string[][] = [];
  for (let i = 0; i < s3Keys.length; i += CHUNK) {
    chunks.push(s3Keys.slice(i, i + CHUNK));
  }

  const failedKeys: string[] = [];

  await Promise.all(
    chunks.map(async (chunk) => {
      const result = await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: false, // set true to only get errors back (slightly faster)
          },
        })
      );
      // Collect per-object errors returned by S3
      if (result.Errors?.length) {
        for (const err of result.Errors) {
          console.error(`S3 deleteObjects error: key=${err.Key} code=${err.Code} msg=${err.Message}`);
          if (err.Key) failedKeys.push(err.Key);
        }
      }
    })
  );

  return failedKeys;
}

export async function deletePrefix(prefix: string): Promise<void> {
  // ListObjectsV2 pages up to 1000 at a time — paginate until done
  let continuationToken: string | undefined;
  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    const keys = (listed.Contents ?? []).map((o) => o.Key).filter(Boolean) as string[];
    if (keys.length > 0) {
      await deleteObjects(keys); // one API call per page (≤1000 keys)
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}
