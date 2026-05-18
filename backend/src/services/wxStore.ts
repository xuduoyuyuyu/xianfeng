/**
 * 微信小店 API 服务
 * 用于获取商品 H5 链接
 */
import https from "https";

const WX_APPID = "wx324776ace1175715";
const WX_SECRET = "82d139124b170804cc214a005df1135f";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300000) {
    return cachedToken.token;
  }
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`;
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.access_token) {
              cachedToken = {
                token: json.access_token,
                expiresAt: Date.now() + (json.expires_in || 7200) * 1000,
              };
              resolve(json.access_token);
            } else {
              reject(new Error(`获取 access_token 失败: ${data}`));
            }
          } catch (e) {
            reject(new Error(`解析 access_token 响应失败: ${data}`));
          }
        });
      })
      .on("error", reject);
  });
}

export async function getProductH5Url(
  productId: string,
  wecomCorpId?: string,
  wecomUserId?: string
): Promise<string | null> {
  try {
    const accessToken = await getAccessToken();
    const apiUrl = `https://api.weixin.qq.com/channels/ec/product/h5url/get?access_token=${accessToken}`;
    const body: any = { product_id: productId };
    if (wecomCorpId) body.wecom_corp_id = wecomCorpId;
    if (wecomUserId) body.wecom_user_id = wecomUserId;

    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const req = https.request(
        apiUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              if (json.errcode === 0 && json.product_h5url) {
                resolve(json.product_h5url);
              } else {
                console.error(
                  `获取商品 H5 链接失败 (productId=${productId}):`,
                  data
                );
                resolve(null);
              }
            } catch (e) {
              console.error(`解析 H5 链接响应失败:`, data);
              resolve(null);
            }
          });
        }
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  } catch (e) {
    console.error("getProductH5Url error:", e);
    return null;
  }
}
