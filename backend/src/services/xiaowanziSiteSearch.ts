export function extractUserQuestion(content: string): string {
  const match = content.match(/\[用户问题\]\s*([\s\S]+)$/);
  return String(match?.[1] || content || "").trim();
}

function extractHonorificTerms(value: string): string[] {
  const results: string[] = [];
  const blockedLeadingChars = /^[问想请我帮给找搜查看聊说和跟的于一了下]/;
  for (const match of value.matchAll(/([\u4e00-\u9fff]{1,6})(老师|教授|校长|博士|医生|妈妈|爸爸)/g)) {
    const prefix = match[1] || "";
    const title = match[2] || "";
    for (let length = 1; length <= Math.min(3, prefix.length); length += 1) {
      const name = prefix.slice(-length);
      if (blockedLeadingChars.test(name)) continue;
      results.push(`${name}${title}`);
    }
  }
  return Array.from(new Set(results));
}

export function extractSearchTerms(content: string): string[] {
  const question = extractUserQuestion(content)
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[，。！？、,.!?;；:："'“”‘’（）()【】]/g, " ");
  const terms = question
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 18 && !/^(请问|帮我|一下|怎么|如何|什么|哪些|可以|能不能|有没有)$/.test(item));
  const compact = question.replace(/\s+/g, "");
  const phraseTerms = Array.from(compact.matchAll(/[\u4e00-\u9fff]{2,8}/g)).map((item) => item[0]);
  return Array.from(new Set([...extractHonorificTerms(compact), ...terms, ...phraseTerms])).slice(0, 8);
}
