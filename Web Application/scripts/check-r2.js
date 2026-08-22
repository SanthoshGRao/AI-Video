const { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, "..", ".env.local");
console.log("Reading environment from:", envPath);

if (!fs.existsSync(envPath)) {
  console.error("❌ .env.local file not found!");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");
const envVars = {};
envContent.split("\n").forEach(line => {
  const match = line.match(/^\s*([\w_]+)\s*=\s*"(.*)"\s*$/) || 
                line.match(/^\s*([\w_]+)\s*=\s*'(.*)'\s*$/) || 
                line.match(/^\s*([\w_]+)\s*=\s*(.*)\s*$/);
  if (match) {
    envVars[match[1]] = match[2].trim();
  }
});

const accountId = envVars.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKeyId = envVars.CLOUDFLARE_R2_ACCESS_KEY;
const secretAccessKey = envVars.CLOUDFLARE_R2_SECRET_KEY;
const bucket = envVars.CLOUDFLARE_R2_BUCKET;
const publicUrl = envVars.CLOUDFLARE_R2_PUBLIC_URL;

console.log("\n--- Cloudflare R2 Configuration ---");
console.log("• Bucket Name:", bucket || "MISSING");
console.log("• Account ID :", accountId || "MISSING");
console.log("• Access Key :", accessKeyId ? accessKeyId.substring(0, 6) + "..." : "MISSING");
console.log("• Secret Key :", secretAccessKey ? secretAccessKey.substring(0, 6) + "..." : "MISSING");
console.log("• Public URL :", publicUrl || "MISSING");

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("\n❌ ERROR: One or more Cloudflare R2 environment variables are missing in .env.local!");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function runVerification() {
  try {
    console.log("\n[1/3] Connecting & Listing objects in bucket...");
    const listRes = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    console.log(`✅ Success! Connected to bucket '${bucket}'. Total objects found: ${listRes.KeyCount ?? 0}`);

    console.log("\n[2/3] Testing Upload (Write Permission)...");
    const testKey = `test-connection-${Date.now()}.txt`;
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: "Cloudflare R2 API connection test successful!",
      ContentType: "text/plain"
    }));
    console.log(`✅ Success! Created test object: '${testKey}'`);

    console.log("\n[3/3] Testing Delete (Clean up)...");
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    console.log("✅ Success! Deleted test object.");

    console.log("\n=======================================================");
    console.log("🎉 VERIFICATION PASSED! Cloudflare R2 API is working perfectly!");
    console.log("=======================================================\n");
  } catch (err) {
    console.error("\n❌ CLOUDFLARE R2 VERIFICATION FAILED!");
    console.error("• Error Code   :", err.name);
    console.error("• Error Message:", err.message);
    if (err.$metadata) {
      console.error("• HTTP Status  :", err.$metadata.httpStatusCode);
    }
  }
}

runVerification();
