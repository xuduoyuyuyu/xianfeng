// sync-program.js - 将 AI 处理结果写入 MongoDB
const fs = require('fs');
const { MongoClient } = require('mongodb');

const DATA = JSON.parse(fs.readFileSync('/tmp/ai-output.json', 'utf8'));
const PROGRAM_CODE = '69a2b71fde29766da9e1b28e';

async function main() {
  const client = new MongoClient('mongodb://xianfeng_mongo:27017/xianfeng');
  await client.connect();
  const db = client.db('xianfeng');
  const programs = db.collection('programs');
  const dicts = db.collection('educationdictionaryentries');
  const guests = db.collection('guests');

  // 1. 更新节目 summary + transcript
  const r = await programs.updateOne(
    { programCode: PROGRAM_CODE },
    { $set: {
        'summary.headline': DATA.summary.headline,
        'summary.body': DATA.summary.body,
        'summary.tags': DATA.summary.tags,
        transcript: DATA.transcript.map(s => ({ time: s.time, speaker: s.speaker, text: s.text })),
        parseStatus: 'success',
        parseFinishedAt: new Date(),
      }
    }
  );
  console.log('✅ 节目更新:', r.modifiedCount ? '成功' : '无变化');

  // 2. 教育词典
  let dictCount = 0;
  for (const entry of DATA.dictionary) {
    const term = String(entry.term || '').trim();
    if (!term) continue;
    const normalizedTerm = term.toLowerCase();
    const result = await dicts.updateOne(
      { normalizedTerm },
      { $setOnInsert: { term, definition: entry.definition, sourceUrl: '', status: 'active', createdAt: new Date() }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );
    if (result.upsertedCount) dictCount++;
  }
  console.log('📚 新增词典:', dictCount, '条');

  // 3. 嘉宾
  const guestIds = [];
  for (const g of DATA.guests) {
    const name = String(g.name || '').trim();
    if (!name) continue;
    const normalizedName = name.toLowerCase();
    const result = await guests.updateOne(
      { normalizedName },
      { $setOnInsert: { name, title: g.title, bio: g.bio, avatar: '', profileUrl: '', status: 'active', createdAt: new Date() }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );
    if (result.upsertedCount) {
      console.log('👤 新建嘉宾:', name);
    } else {
      console.log('👤 已有嘉宾:', name, '(已更新)');
    }
    const guestDoc = await guests.findOne({ normalizedName });
    guestIds.push({ guestId: guestDoc._id.toString(), order: guestIds.length + 1, role: 'main_guest' });
  }

  if (guestIds.length > 0) {
    await programs.updateOne({ programCode: PROGRAM_CODE }, { $set: { guestBindings: guestIds } });
    console.log('🔗 嘉宾关联完成');
  }

  await client.close();
  console.log('🎉 全部完成!');
}

main().catch(e => { console.error(e); process.exit(1); });
