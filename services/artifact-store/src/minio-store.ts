import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  createArtifactObject,
  verifyArtifactIntegrity,
  type ArtifactObject,
} from '@spds/artifact-core';

export interface ObjectStorePutResult {
  readonly objectKey: string;
  readonly contentHash: string;
}

export interface MinioStoreConfig {
  readonly endpoint: string;
  readonly region?: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly forcePathStyle?: boolean;
}

/**
 * S3-compatible MinIO adapter for content-addressed artifacts.
 */
export class MinioObjectStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly meta = new Map<string, ArtifactObject>();
  private ready: Promise<void> | undefined;

  constructor(config: MinioStoreConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region ?? 'us-east-1',
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async ensureBucket(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        try {
          await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
        } catch {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        }
      })();
    }
    await this.ready;
  }

  async put(
    bytes: string,
    mediaType: string,
    tags: readonly string[] = [],
  ): Promise<ObjectStorePutResult> {
    await this.ensureBucket();
    const artifact = createArtifactObject({ bytes, mediaType, tags });
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: artifact.objectKey,
        Body: bytes,
        ContentType: mediaType,
        Metadata: {
          contentHash: artifact.contentHash,
          tags: tags.join(','),
        },
      }),
    );
    this.meta.set(artifact.contentHash, artifact);
    return { objectKey: artifact.objectKey, contentHash: artifact.contentHash };
  }

  async get(objectKey: string): Promise<string | undefined> {
    await this.ensureBucket();
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return await out.Body?.transformToString();
    } catch {
      return undefined;
    }
  }

  async verify(contentHash: string): Promise<boolean> {
    const artifact = this.meta.get(contentHash);
    if (!artifact) return false;
    const bytes = await this.get(artifact.objectKey);
    if (bytes === undefined) return false;
    return verifyArtifactIntegrity(artifact, bytes).ok;
  }

  listMeta(): ArtifactObject[] {
    return [...this.meta.values()];
  }
}

export function minioConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MinioStoreConfig | undefined {
  const endpoint = env['SPDS_MINIO_ENDPOINT'] ?? env['MINIO_ENDPOINT'];
  if (!endpoint) return undefined;
  return {
    endpoint,
    accessKeyId: env['SPDS_MINIO_ACCESS_KEY'] ?? env['MINIO_ROOT_USER'] ?? 'spdsminio',
    secretAccessKey: env['SPDS_MINIO_SECRET_KEY'] ?? env['MINIO_ROOT_PASSWORD'] ?? 'spdsminio',
    bucket: env['SPDS_MINIO_BUCKET'] ?? 'spds-artifacts',
    forcePathStyle: true,
  };
}
