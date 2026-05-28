export type NoVisibleProjectOutputPolicy = {
  noText: boolean;
  noLogo: boolean;
  noQr: boolean;
  noContact: boolean;
  any: boolean;
};

export function enrichPrompt(prompt: string, notes?: string) {
  const text = prompt.trim();
  if (!text) return text;
  const noteText = notes?.trim();
  if (!noteText) return text;
  return `${text}\n\n项目素材备注：${noteText}`;
}

export function resolveNoVisibleProjectOutputPolicy(prompt: string): NoVisibleProjectOutputPolicy {
  const text = prompt || "";
  const noText = /无文字|无字|不要(?:任何)?文字|不要文案|不加文字|不要出现文字|不(?:要|需要).*文字|纯背景|无文字背景|无字背景/i.test(text);
  const noLogo = /不要\s*(?:logo|Logo|LOGO|标志|品牌标识)|无\s*(?:logo|Logo|LOGO|标志|品牌标识)|不(?:要|需要).*(?:logo|Logo|LOGO|标志|品牌标识)/i.test(text);
  const noQr = /不要.*(?:二维码|QR|qr)|无.*(?:二维码|QR|qr)|不(?:要|需要).*(?:二维码|QR|qr)/i.test(text);
  const noContact = /不要.*(?:电话|地址|联系方式|手机号|热线)|无.*(?:电话|地址|联系方式|手机号|热线)|不(?:要|需要).*(?:电话|地址|联系方式|手机号|热线)/i.test(text);
  return { noText, noLogo, noQr, noContact, any: noText || noLogo || noQr || noContact };
}

export function sanitizeCreativeDirectionPrompt(prompt: string, policy = resolveNoVisibleProjectOutputPolicy(prompt)) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (/创作前置判断|入口：|素材优先级|已读取项目上下文|未读取到完整项目素材库|需求补全|单图分析/.test(line)) return false;
      if (/可能主标题|后续需补充素材|需补充素材|缺少：|当前缺少品牌素材/.test(line)) return false;
      if (policy.any && /行业判断|目标人群|传播目标|核心卖点|推荐视觉风格|两个创意方向|素材优先级|缺少真实素材/.test(line)) return false;
      if (policy.noText && /核心文字|可能主标题|主标题|副标题|卖点|文字|文案|电话|地址|机构|医院名|品牌名/.test(line)) {
        return /用户想法|用户需求|用户补充/.test(line);
      }
      if (policy.noLogo && /Logo|LOGO|logo|品牌标识|院标/.test(line)) return false;
      if (policy.noQr && /二维码|QR|qr|扫码/.test(line)) return false;
      if (policy.noContact && /电话|地址|联系方式|手机号|热线/.test(line)) return false;
      return true;
    })
    .join("\n");
}

export function sanitizeProjectMemoryForPrompt(text: string, visibleRequestText = "") {
  const policy = resolveNoVisibleProjectOutputPolicy(visibleRequestText);
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (/创作前置判断|入口：|素材优先级|已读取项目上下文|未读取到完整项目素材库|需求补全|单图分析/.test(line)) return false;
      if (/可能主标题|后续需补充素材|需补充素材|缺少：|当前缺少品牌素材|禁止在没有来源素材|画面中不要出现假|商业成熟度|输出完整性/.test(line)) return false;
      if (policy.noText && /文字|标题|副标题|卖点|文案|电话|地址|机构名称|医院|品牌名|常用宣传语/.test(line)) return false;
      if (policy.noLogo && /Logo|LOGO|logo|品牌标识|院标/.test(line)) return false;
      if (policy.noQr && /二维码|QR|qr|扫码/.test(line)) return false;
      if (policy.noContact && /电话|地址|联系方式|手机号|热线/.test(line)) return false;
      return true;
    })
    .slice(0, 12)
    .join("\n");
}

export function isConservativeImageToImageNote(line: string) {
  return /keepMainSubject|主体、产品、主视觉结构不要改变|主体和构图尽量保持|核心构图不要随意替换|保持原图|原图比例|比例不变|内容不减|只优化版式|不改变布局|不要改变版式|主体结构.*不变|主要版式.*不变/.test(line);
}

export function sanitizeLegacyImageToImagePrompt(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isLegacyImageToImageDefault(line))
    .join("\n");
}

function isLegacyImageToImageDefault(line: string) {
  return /内容不减，比例不变，优化版式，生成(?:专业清晰的)?新版设计。?$/.test(line) ||
    /内容不减，比例不变，保留原图核心文字、LOGO、电话、地址和主体信息，只优化版式、光影、背景质感和视觉层级，生成专业清晰的新版设计。?$/.test(line) ||
    /保持主体结构和主要版式不变，只优化我接下来指定的部分。?$/.test(line);
}

export function resolveVisibleProjectInfoRequests(text: string) {
  const prompt = text || "";
  const explicitAdd = /放上|加上|加入|添加|写上|显示|展示|露出|带上|包含|需要|必须有|要有|使用|引用|贴上|保留|保持|沿用|复用|还原|不要改|别改/.test(prompt);
  return {
    organization: explicitAdd && /机构名称|机构名|公司名称|公司名|品牌名称|品牌名|医院名称|医院名|门店名称|店名|馆名/.test(prompt),
    phone: explicitAdd && /电话|联系方式|联系电话|手机号|热线|预约电话/.test(prompt),
    address: explicitAdd && /地址|位置|定位|地图|导航|门店|院区/.test(prompt),
    logo: explicitAdd && /logo|Logo|LOGO|标志|品牌标识|院标|馆标/.test(prompt),
    qr: explicitAdd && /二维码|扫码|QR|qr/.test(prompt),
    ip: explicitAdd && /IP形象|ip形象|吉祥物|卡通形象/.test(prompt),
    copy: explicitAdd && /文案|文字|标题|主标题|副标题|标语|slogan|卖点|宣传语/.test(prompt),
  };
}

export function shouldUseProjectPromptContext(text: string) {
  const prompt = text.trim();
  if (!prompt) return false;
  const visibleRequests = resolveVisibleProjectInfoRequests(prompt);
  if (Object.values(visibleRequests).some(Boolean)) return true;
  return /当前项目|项目资料|项目素材|素材库|使用.*素材|引用.*素材|品牌|品牌色|logo|Logo|LOGO|标志|院标|馆标|电话|地址|联系方式|手机号|热线|二维码|QR|qr|机构|公司|医院|门店|客户|活动|报名|招募|展览|讲座|课程|IP形象|ip形象|吉祥物|宣传语|slogan|口号|真实信息|真实文案/.test(prompt);
}
