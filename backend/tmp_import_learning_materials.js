const fs = require('fs');
const mongoose = require('mongoose');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:60014/knowledge-base';
  const csvPath = process.env.CSV_PATH || '/Users/QUAN/Downloads/家长先疯_学习资料_表格.csv';
  await mongoose.connect(uri);

  const schema = new mongoose.Schema(
    {
      title: String,
      description: String,
      fileUrl: String,
      category: String,
      status: String,
      publishedAt: Date,
    },
    { timestamps: true }
  );

  const LearningMaterial = mongoose.models.LearningMaterial || mongoose.model('LearningMaterial', schema);

  const raw = fs
    .readFileSync(csvPath, 'utf8')
    .replace(/^\uFEFF/, '');

  const lines = raw.split(/\r?\n/).filter(Boolean);
  const dataLines = lines.slice(1);

  let total = 0;
  let ok = 0;
  let fail = 0;

  for (const line of dataLines) {
    if (!line.trim()) continue;
    total += 1;

    const [name, url, grade, subject, stage, keycat] = parseCsvLine(line).map((v) =>
      (v || '').trim()
    );

    if (!name || !url) {
      fail += 1;
      continue;
    }

    const category = [stage, subject, grade, keycat].filter(Boolean).join(' / ') || '未分类';
    const description = `年级：${grade || '未标注'}；学科：${subject || '未标注'}；阶段：${stage || '未标注'}；关键分类：${keycat || '未标注'}`;

    try {
      await LearningMaterial.updateOne(
        { title: name },
        {
          $set: {
            title: name,
            fileUrl: url,
            category,
            description,
            status: 'published',
            publishedAt: new Date(),
          },
        },
        { upsert: true }
      );
      ok += 1;
    } catch (_e) {
      fail += 1;
    }
  }

  const publishedCount = await LearningMaterial.countDocuments({ status: 'published' });
  console.log(JSON.stringify({ total, ok, fail, publishedCount }));

  await mongoose.disconnect();
})();
