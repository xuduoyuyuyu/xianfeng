export interface WorthBuyInputParseResult {
  query: string;
  url: string;
  brand: string;
  extractedTitle: string;
}

export function isJdLikeWorthBuyUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "3.cn" || hostname === "jd.com" || hostname.endsWith(".jd.com");
  } catch {
    return false;
  }
}

export function refineWorthBuyTitle(title: string): string {
  let refined = title
    .trim()
    .replace(/\s+/g, "")
    .replace(/^[\u4e00-\u9fa5A-Za-z0-9·]{1,10}同款/g, "")
    .replace(/^(官方|正品|旗舰店|爆款|新款|热卖|大促价保|限时|包邮)+/g, "");

  const tailMatch = refined.match(/^(.*?)(?:学习|阅读|专用|儿童|学生|宝宝|婴儿|家用|宿舍)/);
  if (tailMatch?.[1] && tailMatch[1].length >= 4) {
    refined = tailMatch[1];
  }

  return refined || title.trim();
}

function extractShareTitle(query: string, url: string): string {
  const taobaoTitleMatch = query.match(/【淘宝】[^【]*?「([^」]+)」/);
  if (taobaoTitleMatch?.[1]) return refineWorthBuyTitle(taobaoTitleMatch[1]);

  if (!url || !isJdLikeWorthBuyUrl(url)) return "";

  const withoutUrl = query
    .replace(url, " ")
    .replace(/https?:\/\/[^\s"'<>]+/gi, " ");

  const candidate = withoutUrl
    .replace(/多快好省[，,、\s]*购物上京东/g, " ")
    .replace(/购物上京东|多快好省[，,、\s]*购物上|多快好省/g, " ")
    .replace(/【?京东】?/g, " ")
    .replace(/JD\.?COM/gi, " ")
    .replace(/打开京东APP查看|复制.*?打开京东|点击链接直接打开|立即购买|商品链接|商品口令/g, " ")
    .replace(/分享给你(?:一个|的)?京东商品/g, " ")
    .replace(/[「」【】“”"'<>]/g, " ")
    .replace(/[，。；、,.!?！？:：]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!candidate || candidate.length < 4 || /^(京东|JD|COM)$/i.test(candidate)) return "";
  return refineWorthBuyTitle(candidate);
}

export function parseWorthBuyInput(input: string): WorthBuyInputParseResult {
  const query = input.trim();
  const urlMatch = query.match(/https?:\/\/[^\s"'<>]+/i);
  const url = urlMatch ? urlMatch[0].replace(/[，。；、,.!?！？]+$/g, "") : "";
  const extractedTitle = extractShareTitle(query, url);

  return {
    query,
    url,
    brand: url ? "" : query,
    extractedTitle,
  };
}
