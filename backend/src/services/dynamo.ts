import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from '../config';

const client = new DynamoDBClient({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

const ddb = DynamoDBDocumentClient.from(client);
const TABLE = config.dynamoTable;

export interface TryOnSession {
  deviceId: string;       // DynamoDB PK (legacy: actual deviceId, new: Clerk userId)
  sessionId: string;      // DynamoDB SK
  userId?: string;        // Clerk userId (for future GSI queries)
  sourceUrl?: string;
  selfieS3Key?: string;
  tryonS3Key: string;
  videoS3Key?: string;
  tryonCdnUrl: string;
  videoCdnUrl?: string;
  model: string;
  createdAt: string;
}

export async function putSession(session: TryOnSession): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        ...session,
        userId: session.userId || session.deviceId, // Ensure userId is always written for future GSI
      },
    })
  );
}

export async function getSession(
  deviceId: string,
  sessionId: string
): Promise<TryOnSession | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { deviceId, sessionId },
    })
  );
  return (result.Item as TryOnSession) || null;
}

// AC-16: Paginate DynamoDB query — single query can silently drop items beyond 1MB
export async function queryByDevice(deviceId: string): Promise<TryOnSession[]> {
  const allItems: TryOnSession[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'deviceId = :did',
        ExpressionAttributeValues: { ':did': deviceId },
        ScanIndexForward: false, // newest first
        ExclusiveStartKey: lastKey,
      })
    );
    if (result.Items) allItems.push(...(result.Items as TryOnSession[]));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return allItems;
}

export async function queryBySourceUrl(
  deviceId: string,
  sourceUrl: string
): Promise<TryOnSession | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'SourceUrlIndex',
      KeyConditionExpression: 'deviceId = :did AND sourceUrl = :url',
      ExpressionAttributeValues: {
        ':did': deviceId,
        ':url': sourceUrl,
      },
      Limit: 1,
      ScanIndexForward: false,
    })
  );
  return (result.Items?.[0] as TryOnSession) || null;
}

export async function updateSessionVideo(
  deviceId: string,
  sessionId: string,
  videoS3Key: string,
  videoCdnUrl: string
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { deviceId, sessionId },
      UpdateExpression: 'SET videoS3Key = :vk, videoCdnUrl = :vu',
      ExpressionAttributeValues: {
        ':vk': videoS3Key,
        ':vu': videoCdnUrl,
      },
    })
  );
}

export async function deleteSession(
  deviceId: string,
  sessionId: string
): Promise<TryOnSession | null> {
  const session = await getSession(deviceId, sessionId);
  if (!session) return null;

  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { deviceId, sessionId },
    })
  );

  return session;
}

export async function deleteAllSessions(
  deviceId: string
): Promise<TryOnSession[]> {
  const sessions = await queryByDevice(deviceId);
  if (sessions.length === 0) return [];

  const CHUNK = 25; // DynamoDB BatchWriteItem hard limit
  const chunks: TryOnSession[][] = [];
  for (let i = 0; i < sessions.length; i += CHUNK) {
    chunks.push(sessions.slice(i, i + CHUNK));
  }

  // ERR-12: Retry unprocessed items with exponential backoff
  for (const chunk of chunks) {
    let items = chunk.map((s) => ({
      DeleteRequest: { Key: { deviceId, sessionId: s.sessionId } },
    }));
    let retries = 0;
    while (items.length > 0 && retries < 5) {
      const result = await ddb.send(
        new BatchWriteCommand({
          RequestItems: { [TABLE]: items },
        })
      );
      const unprocessed = result.UnprocessedItems?.[TABLE];
      if (!unprocessed || unprocessed.length === 0) break;
      items = unprocessed as typeof items;
      retries++;
      await new Promise((r) => setTimeout(r, Math.pow(2, retries) * 100));
    }
  }

  return sessions;
}
