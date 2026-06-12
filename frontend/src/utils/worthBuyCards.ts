import { chooseWorthBuyEmoji } from "./worthBuyEmoji";
import { resolveWorthBuyDisplayTitle } from "./worthBuyResult";

export interface WorthBuyCardUserItem {
  query: string;
  brand?: string | null;
  result: any;
  createdAt: string;
}

export interface WorthBuyCardDemoItem {
  q: string;
  icon: string;
  tag: string;
}

export interface WorthBuyCardItem {
  source: "user" | "demo";
  key: string;
  query: string;
  title: string;
  tag: string;
  icon: string;
  result?: any;
  brand?: string | null;
}

function cardIdentity(value: string): string {
  return value.trim().toLowerCase();
}

export function buildWorthBuyCardItems(input: {
  userItems: WorthBuyCardUserItem[];
  demoItems: WorthBuyCardDemoItem[];
}): WorthBuyCardItem[] {
  const seen = new Set<string>();
  const userCards = input.userItems.map((item) => {
    const title = resolveWorthBuyDisplayTitle(item.query, item.result || { brand: item.brand });
    seen.add(cardIdentity(title));
    seen.add(cardIdentity(item.query));
    if (item.brand) seen.add(cardIdentity(item.brand));
    return {
      source: "user" as const,
      key: `user:${item.query}`,
      query: item.query,
      title,
      tag: item.result?.isIqTax ? "智商税" : "非智商税",
      icon: chooseWorthBuyEmoji({ title, query: item.query, result: item.result }),
      result: item.result,
      brand: item.brand,
    };
  });

  const demoCards = input.demoItems
    .filter((demo) => !seen.has(cardIdentity(demo.q)))
    .map((demo) => ({
      source: "demo" as const,
      key: `demo:${demo.q}`,
      query: demo.q,
      title: demo.q,
      tag: demo.tag,
      icon: demo.icon,
    }));

  return [...userCards, ...demoCards];
}
