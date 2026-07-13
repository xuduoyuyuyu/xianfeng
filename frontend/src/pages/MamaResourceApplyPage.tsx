import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import GlobalPublicNav from "../components/GlobalPublicNav";
import InlineLoginForm from "../components/InlineLoginForm";
import { publicApi } from "../services/api";
import type { RootState } from "../store";

const categoryOptions = ["亲子阅读", "学习用品", "母婴", "儿童健康", "家庭消费", "教育规划"];
const childStageOptions = ["孕产/婴幼儿", "幼儿园", "小学", "初中", "高中", "多孩家庭"];
const childGenderOptions = ["男孩", "女孩"];
const platformOptions = [
  { value: "xiaohongshu", label: "小红书" },
  { value: "douyin", label: "抖音" },
] as const;
const realNameVerifiedOptions = [
  { value: "yes", label: "已实名" },
  { value: "no", label: "未实名" },
] as const;

type MediaPlatform = "xiaohongshu" | "douyin";

type MediaAccountForm = {
  platform: MediaPlatform | "";
  nickname: string;
  profileUrl: string;
  followerCount: string;
  realNameVerified: "" | "yes" | "no";
};

type FormState = {
  displayName: string;
  contactPhone: string;
  contactWechat: string;
  city: string;
  childStage: string;
  childGender: string;
  xiaohongshuNickname: string;
  xiaohongshuProfileUrl: string;
  xiaohongshuScreenshotUrl: string;
  followerCount: string;
  realNameVerified: "" | "yes" | "no";
  mediaAccounts: MediaAccountForm[];
  accountPositioning: string;
  categories: string[];
  blockedCategories: string;
  consentAccepted: boolean;
};

function blankMediaAccount(): MediaAccountForm {
  return {
    platform: "",
    nickname: "",
    profileUrl: "",
    followerCount: "",
    realNameVerified: "",
  };
}

const initialForm: FormState = {
  displayName: "",
  contactPhone: "",
  contactWechat: "",
  city: "",
  childStage: "",
  childGender: "",
  xiaohongshuNickname: "",
  xiaohongshuProfileUrl: "",
  xiaohongshuScreenshotUrl: "",
  followerCount: "",
  realNameVerified: "",
  mediaAccounts: [],
  accountPositioning: "",
  categories: [],
  blockedCategories: "",
  consentAccepted: false,
};

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function parseFollowerCount(value: string): number | null {
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function buildSubmitMediaAccounts(form: FormState) {
  const primary = {
    platform: "xiaohongshu" as const,
    nickname: form.xiaohongshuNickname.trim(),
    profileUrl: form.xiaohongshuProfileUrl.trim(),
    screenshotUrl: form.xiaohongshuScreenshotUrl,
    followerCount: parseFollowerCount(form.followerCount),
    realNameVerified: form.realNameVerified ? form.realNameVerified === "yes" : null,
  };
  const extras = form.mediaAccounts
    .filter((account): account is MediaAccountForm & { platform: MediaPlatform } =>
      Boolean(account.platform && account.nickname.trim() && account.profileUrl.trim())
    )
    .map((account) => ({
      platform: account.platform,
      nickname: account.nickname.trim(),
      profileUrl: account.profileUrl.trim(),
      followerCount: parseFollowerCount(account.followerCount),
      realNameVerified: account.realNameVerified ? account.realNameVerified === "yes" : null,
    }));
  return [primary, ...extras];
}

const MamaResourceApplyPage: React.FC = () => {
  const { user, token } = useSelector((state: RootState) => state.user);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const loggedInMobile = String(user?.mobile || "").trim();

  useEffect(() => {
    if (!loggedInMobile) return;
    setForm((current) => ({
      ...current,
      contactPhone: current.contactPhone || loggedInMobile,
    }));
  }, [loggedInMobile]);

  const canSubmit = useMemo(() => {
    return Boolean(
      form.displayName.trim() &&
      form.contactWechat.trim() &&
      form.xiaohongshuProfileUrl.trim() &&
      form.xiaohongshuNickname.trim() &&
      form.consentAccepted &&
      !uploadingScreenshot &&
      !submitting
    );
  }, [form, submitting, uploadingScreenshot]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateMediaAccount = <K extends keyof MediaAccountForm>(index: number, key: K, value: MediaAccountForm[K]) => {
    setForm((current) => {
      const mediaAccounts = [...current.mediaAccounts];
      mediaAccounts[index] = { ...(mediaAccounts[index] || blankMediaAccount()), [key]: value };
      return { ...current, mediaAccounts };
    });
  };

  const addMediaAccount = () => {
    setForm((current) => ({ ...current, mediaAccounts: [...current.mediaAccounts, blankMediaAccount()] }));
  };

  const removeMediaAccount = (index: number) => {
    setForm((current) => ({
      ...current,
      mediaAccounts: current.mediaAccounts.filter((_item, itemIndex) => itemIndex !== index),
    }));
  };

  const handleScreenshotChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingScreenshot(true);
    setMessage("");
    try {
      const response = await publicApi.uploadMamaResourceScreenshot(file);
      updateField("xiaohongshuScreenshotUrl", response.data.url || "");
      setMessage("小红书页面截图已上传。");
      setSubmitted(true);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || error?.message || "截图上传失败，请稍后重试");
      setSubmitted(false);
    } finally {
      setUploadingScreenshot(false);
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setMessage("");
    try {
      await publicApi.submitMamaResourceApplication({
        displayName: form.displayName.trim(),
        contactPhone: form.contactPhone.trim(),
        contactWechat: form.contactWechat.trim(),
        city: form.city.trim(),
        childStage: form.childStage,
        childGender: form.childGender,
        xiaohongshuNickname: form.xiaohongshuNickname.trim(),
        xiaohongshuProfileUrl: form.xiaohongshuProfileUrl.trim(),
        xiaohongshuScreenshotUrl: form.xiaohongshuScreenshotUrl,
        followerCount: form.followerCount.trim(),
        realNameVerified: form.realNameVerified ? form.realNameVerified === "yes" : null,
        mediaAccounts: buildSubmitMediaAccounts(form),
        accountPositioning: form.accountPositioning.trim(),
        categories: form.categories,
        blockedCategories: form.blockedCategories,
        consentAccepted: form.consentAccepted,
      });
      setSubmitted(true);
      setForm({ ...initialForm, contactPhone: loggedInMobile });
      setMessage("资料已提交，我们会先完成账号审核，再联系你确认适合的发稿机会。");
    } catch (error: any) {
      const nextMessage =
        error?.response?.data?.message ||
        error?.message ||
        "提交失败，请稍后重试";
      setMessage(nextMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f3ff] text-[#171321]">
      <GlobalPublicNav />
      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-[24px] px-[14px] pb-[calc(26px+env(safe-area-inset-bottom))] pt-24 sm:px-6">
        <section className="flex flex-col gap-[24px]">
          <div className="rounded-[17px] border border-[#5e17eb]/15 bg-white px-[14px] py-[15px] shadow-[0_8px_22px_rgba(94,23,235,0.08)]">
            <div className="mb-[11px] flex items-center gap-[9px]">
              <img src="/assets/mama-hao-zhuan-icon.png" alt="" className="h-[44px] w-[44px] shrink-0 object-contain" />
              <h1 className="text-[19px] font-black leading-[1.18] text-[#151222]">
                妈妈好赚
              </h1>
            </div>
            <p className="text-[13px] font-semibold leading-[1.68] text-[#5f5966]">
              如果你愿意用自己的小红书账号接亲子、教育、家庭消费相关发稿，可以先把基础资料提交给我们，通过审核，我们会联系您入群，进行后续任务派发。
            </p>
            <div className="mt-[16px] grid gap-[12px] text-[11.5px] font-extrabold leading-[1.4] text-[#39206f]">
              <div className="flex min-h-[52px] items-center rounded-[16px] border border-[#5e17eb]/10 bg-[#f1eaff] px-[14px]">小红书优先，收主页链接</div>
              <div className="flex min-h-[52px] items-center rounded-[16px] border border-[#5e17eb]/10 bg-[#f1eaff] px-[14px]">不需要账号密码，不要求代登录</div>
              <div className="flex min-h-[52px] items-center rounded-[16px] border border-[#5e17eb]/10 bg-[#f1eaff] px-[14px]">数据用于审核匹配，可联系运营更新或停用资料</div>
            </div>
          </div>

          {!token || !user ? (
            <div className="rounded-[17px] border border-[#5e17eb]/15 bg-white px-[14px] py-[15px] shadow-[0_8px_22px_rgba(94,23,235,0.08)]">
              <h1 className="text-[19px] font-black leading-[1.18] text-[#151222]">登录后开始填写</h1>
              <p className="mb-[14px] mt-[5px] text-[12px] font-bold leading-[1.6] text-[#6b6474]">
                这个页面可以直接发给用户。先用手机号验证码登录，登录后资料会归属到当前账号，后续可继续查看任务和更新资料。
              </p>
              <InlineLoginForm compact onSuccess={() => setMessage("登录成功，请继续填写资料。")} />
            </div>
          ) : (

          <form id="mama-resource-apply-form" onSubmit={handleSubmit} className="rounded-[17px] border border-[#5e17eb]/15 bg-white px-[14px] py-[15px] shadow-[0_8px_22px_rgba(94,23,235,0.08)]">
            <div className="mb-[11px] flex items-center gap-[9px]">
              <div>
                <h1 className="text-[19px] font-black leading-[1.18] text-[#151222]">资料提交</h1>
                <p className="mt-[3px] text-[11.5px] font-bold text-[#6b6474]">填写基础资料后进入待审核</p>
              </div>
            </div>
            <div className="grid gap-0">
              <label className="mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]">
                姓名/昵称
                <input
                  className="mt-[6px] h-[39px] min-h-[39px] w-full rounded-[11px] border border-[#ddd7e8] px-[11px] text-[13px] font-medium leading-[39px] outline-none focus:border-[#6c27d6]"
                  value={form.displayName}
                  onChange={(event) => updateField("displayName", event.target.value)}
                  placeholder="例如：安安妈妈"
                />
              </label>
              <label className="mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]">
                微信号
                <input
                  name="contactWechat"
                  className="mt-[6px] h-[39px] min-h-[39px] w-full rounded-[11px] border border-[#ddd7e8] px-[11px] text-[13px] font-medium leading-[39px] outline-none focus:border-[#6c27d6]"
                  value={form.contactWechat}
                  onChange={(event) => updateField("contactWechat", event.target.value)}
                  placeholder="优先通过微信添加"
                />
              </label>
              <label className="mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]">
                手机号
                <input
                  name="contactPhone"
                  className="mt-[6px] h-[39px] min-h-[39px] w-full rounded-[11px] border border-[#ddd7e8] px-[11px] text-[13px] font-medium leading-[39px] outline-none focus:border-[#6c27d6]"
                  value={form.contactPhone}
                  onChange={(event) => updateField("contactPhone", event.target.value)}
                  placeholder="备用联系电话"
                />
              </label>
              <label className="mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]">
                城市
                <input
                  className="mt-[6px] h-[39px] min-h-[39px] w-full rounded-[11px] border border-[#ddd7e8] px-[11px] text-[13px] font-medium leading-[39px] outline-none focus:border-[#6c27d6]"
                  value={form.city}
                  onChange={(event) => updateField("city", event.target.value)}
                  placeholder="上海 / 杭州"
                />
              </label>
              <label className="mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]">
                孩子阶段
                <select
                  name="childStage"
                  className="mt-[6px] h-[39px] min-h-[39px] w-full rounded-[11px] border border-[#ddd7e8] bg-white px-[11px] text-[13px] font-medium leading-[39px] text-[#8b8792] outline-none focus:border-[#6c27d6]"
                  value={form.childStage}
                  onChange={(event) => updateField("childStage", event.target.value)}
                >
                  <option value="">请选择</option>
                  {childStageOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <div className="mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]">
                <div>孩子性别</div>
                <div className="mt-[6px] flex flex-wrap gap-[6px]">
                  {childGenderOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => updateField("childGender", item)}
                      className={`min-h-[27px] rounded-full border px-[12px] text-[12px] font-extrabold leading-[27px] ${
                        form.childGender === item
                          ? "border-[#8f4dff] bg-[#f3eaff] text-[#7c2ce6]"
                          : "border-[#ddd7e8] bg-[#f5f6fa] text-[#6b6474]"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <label className="mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]">
                小红书账号昵称
                <input
                  name="xiaohongshuNickname"
                  className="mt-[6px] h-[39px] min-h-[39px] w-full rounded-[11px] border border-[#ddd7e8] px-[11px] text-[13px] font-medium leading-[39px] outline-none focus:border-[#6c27d6]"
                  value={form.xiaohongshuNickname}
                  onChange={(event) => updateField("xiaohongshuNickname", event.target.value)}
                  placeholder="账号主页展示的昵称"
                />
              </label>
              <label className="mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]">
                小红书主页链接
                <input
                  className="mt-[6px] h-[39px] min-h-[39px] w-full rounded-[11px] border border-[#ddd7e8] px-[11px] text-[13px] font-medium leading-[39px] outline-none focus:border-[#6c27d6]"
                  value={form.xiaohongshuProfileUrl}
                  onChange={(event) => updateField("xiaohongshuProfileUrl", event.target.value)}
                  placeholder="https://www.xiaohongshu.com/user/profile/..."
                />
              </label>
              <label className="mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]">
                小红书页面截图
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotChange}
                  className="mt-[6px] min-h-[39px] w-full rounded-[11px] border border-[#ddd7e8] bg-white px-[11px] py-[9px] text-[12px] font-medium outline-none focus:border-[#6c27d6]"
                />
                <span className="mt-[4px] block text-[11px] font-bold text-[#8b8792]">
                  {uploadingScreenshot ? "截图上传中..." : form.xiaohongshuScreenshotUrl ? "已上传，可继续提交" : "从手机相册选择小红书主页截图"}
                </span>
              </label>
              <label className="mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]">
                粉丝数
                <input
                  name="followerCount"
                  inputMode="numeric"
                  className="mt-[6px] h-[39px] min-h-[39px] w-full rounded-[11px] border border-[#ddd7e8] px-[11px] text-[13px] font-medium leading-[39px] outline-none focus:border-[#6c27d6]"
                  value={form.followerCount}
                  onChange={(event) => updateField("followerCount", event.target.value)}
                  placeholder="例如：12800"
                />
              </label>
              <div className="mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]">
                <div>是否实名认证</div>
                <div className="mt-[6px] flex flex-wrap gap-[6px]">
                  {realNameVerifiedOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => updateField("realNameVerified", form.realNameVerified === item.value ? "" : item.value)}
                      className={`min-h-[27px] rounded-full border px-[12px] text-[12px] font-extrabold leading-[27px] ${
                        form.realNameVerified === item.value
                          ? "border-[#8f4dff] bg-[#f3eaff] text-[#7c2ce6]"
                          : "border-[#ddd7e8] bg-[#f5f6fa] text-[#6b6474]"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-[12px] rounded-[12px] bg-[#f8f6ff] p-[10px]">
              <div className="flex items-center justify-between gap-[10px]">
                <div>
                  <div className="text-[12.5px] font-extrabold text-[#4b4453]">其他媒体账号</div>
                  <p className="mt-[2px] text-[11px] font-bold text-[#8b8792]">可继续补充小红书或抖音账号。</p>
                </div>
                <button
                  type="button"
                  onClick={addMediaAccount}
                  className="shrink-0 rounded-full border border-[#6c27d6] px-[12px] py-[7px] text-[12px] font-black text-[#6c27d6]"
                >
                  添加新账号
                </button>
              </div>
              {form.mediaAccounts.map((account, index) => (
                <div key={index} className="mt-[10px] rounded-[11px] border border-[#e5def4] bg-white p-[10px]">
                  <div className="flex items-center justify-between gap-[10px]">
                    <div className="text-[12px] font-black text-[#4b4453]">账号 {index + 2}</div>
                    <button
                      type="button"
                      onClick={() => removeMediaAccount(index)}
                      className="text-[12px] font-black text-[#be123c]"
                    >
                      删除
                    </button>
                  </div>
                  <div className="mt-[8px] flex flex-wrap gap-[6px]">
                    {platformOptions.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => updateMediaAccount(index, "platform", item.value)}
                        className={`min-h-[27px] rounded-full border px-[12px] text-[12px] font-extrabold leading-[27px] ${
                          account.platform === item.value
                            ? "border-[#8f4dff] bg-[#f3eaff] text-[#7c2ce6]"
                            : "border-[#ddd7e8] bg-[#f5f6fa] text-[#6b6474]"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <label className="mt-[8px] block text-[12px] font-extrabold text-[#4b4453]">
                    账号昵称
                    <input
                      className="mt-[5px] h-[37px] w-full rounded-[10px] border border-[#ddd7e8] px-[10px] text-[13px] font-medium outline-none focus:border-[#6c27d6]"
                      value={account.nickname}
                      onChange={(event) => updateMediaAccount(index, "nickname", event.target.value)}
                      placeholder="必填"
                    />
                  </label>
                  <label className="mt-[8px] block text-[12px] font-extrabold text-[#4b4453]">
                    主页链接
                    <input
                      className="mt-[5px] h-[37px] w-full rounded-[10px] border border-[#ddd7e8] px-[10px] text-[13px] font-medium outline-none focus:border-[#6c27d6]"
                      value={account.profileUrl}
                      onChange={(event) => updateMediaAccount(index, "profileUrl", event.target.value)}
                      placeholder="账号主页链接"
                    />
                  </label>
                  <label className="mt-[8px] block text-[12px] font-extrabold text-[#4b4453]">
                    粉丝数
                    <input
                      inputMode="numeric"
                      className="mt-[5px] h-[37px] w-full rounded-[10px] border border-[#ddd7e8] px-[10px] text-[13px] font-medium outline-none focus:border-[#6c27d6]"
                      value={account.followerCount}
                      onChange={(event) => updateMediaAccount(index, "followerCount", event.target.value)}
                      placeholder="例如：8000"
                    />
                  </label>
                  <div className="mt-[8px] flex flex-wrap gap-[6px]">
                    {realNameVerifiedOptions.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => updateMediaAccount(index, "realNameVerified", account.realNameVerified === item.value ? "" : item.value)}
                        className={`min-h-[27px] rounded-full border px-[12px] text-[12px] font-extrabold leading-[27px] ${
                          account.realNameVerified === item.value
                            ? "border-[#8f4dff] bg-[#f3eaff] text-[#7c2ce6]"
                            : "border-[#ddd7e8] bg-[#f5f6fa] text-[#6b6474]"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <label className="mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]">
              账号定位
              <textarea
                className="mt-[6px] min-h-[40px] w-full rounded-[11px] border border-[#ddd7e8] px-[11px] py-[10px] text-[13px] font-medium leading-[1.5] outline-none focus:border-[#6c27d6]"
                value={form.accountPositioning}
                onChange={(event) => updateField("accountPositioning", event.target.value)}
                placeholder="例如：亲子阅读、学习规划、家居收纳、母婴好物"
              />
            </label>

            <div className="mt-[10px]">
              <div className="text-[12.5px] font-extrabold text-[#4b4453]">可发品类</div>
              <div className="mt-[6px] flex flex-wrap gap-[6px]">
                {categoryOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => updateField("categories", toggleValue(form.categories, item))}
                    className={`min-h-[31px] rounded-full border px-[13px] text-[13.5px] font-extrabold leading-[31px] ${
                      form.categories.includes(item)
                        ? "border-[#6c27d6] bg-[#6c27d6] text-white"
                        : "border-[#ddd7e8] bg-white text-[#5d5666]"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-[11px] grid gap-[8px] rounded-[12px] bg-[#f8f6ff] p-[10px]">
              <label className="block text-[12.5px] font-extrabold text-[#4b4453]">
                暂不接的品类
                <input
                  className="mt-[6px] h-[39px] min-h-[39px] w-full rounded-[11px] border border-[#ddd7e8] bg-white px-[11px] text-[13px] font-medium leading-[39px] outline-none focus:border-[#6c27d6]"
                  value={form.blockedCategories}
                  onChange={(event) => updateField("blockedCategories", event.target.value)}
                  placeholder="例如：医美、金融、成人用品"
                />
              </label>
              <label className="flex items-start gap-[5px] text-[12px] font-extrabold leading-[1.5] text-[#4b4453]">
                <input
                  type="checkbox"
                  checked={form.consentAccepted}
                  onChange={(event) => updateField("consentAccepted", event.target.checked)}
                  className="peer sr-only"
                />
                <span className="mt-[1px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border border-[#6c27d6] bg-white text-[11px] font-black leading-none text-[#6c27d6] opacity-40 peer-checked:opacity-100">✓</span>
                    我同意家和万事团队为发稿资源匹配和运营联系使用以上资料
              </label>
            </div>

            {message ? (
              <div className={`mt-[12px] rounded-[11px] px-[11px] py-[10px] text-[13px] font-extrabold ${submitted ? "bg-[#effaf4] text-[#166534]" : "bg-[#fff1f2] text-[#be123c]"}`}>
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-[13px] w-full rounded-[13px] bg-[#6c27d6] p-[13px] text-[14.5px] font-black leading-none text-white shadow-[0_7px_16px_rgba(108,39,214,0.24)] disabled:cursor-not-allowed disabled:bg-[#c8c2d3] disabled:shadow-none"
            >
              {submitting ? "提交中..." : "提交资料，进入待审核"}
            </button>
          </form>
          )}
        </section>
      </main>
    </div>
  );
};

export default MamaResourceApplyPage;
