import 'dotenv/config';
import {
  PutBucketCorsCommand,
  S3Client,
  type CORSRule,
} from '@aws-sdk/client-s3';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const s3 = new S3Client({
    endpoint: requireEnv('B2_ENDPOINT'),
    region: process.env.B2_REGION ?? 'us-east-005',
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv('B2_KEY_ID'),
      secretAccessKey: requireEnv('B2_APPLICATION_KEY'),
    },
  });

  const origins = (process.env.B2_CORS_ORIGINS ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const rules: CORSRule[] = [
    {
      ID: 'browser-upload-and-download',
      AllowedOrigins: origins,
      AllowedMethods: ['PUT', 'GET', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    },
  ];

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: requireEnv('B2_BUCKET'),
      CORSConfiguration: { CORSRules: rules },
    }),
  );

  console.log(
    `Applied B2 CORS rules for origins: ${origins.join(', ')} ` +
      `(PUT/GET/HEAD, all headers).`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
