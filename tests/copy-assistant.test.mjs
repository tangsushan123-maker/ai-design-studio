import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCopyAssistantImagePrompt,
  buildCopyAssistantPrompt,
  normalizeCopyAssistantInput,
  normalizeCopyAssistantResult,
} from "../lib/copy-assistant.ts";

describe("copy assistant", () => {
  it("sends the user's exact request to the model and treats project context as weak reference", () => {
    const input = normalizeCopyAssistantInput({
      prompt: "六月一儿童节海报，品牌海报，医疗行业，帮我想出一个方案",
      context: {
        projectName: "把这个三个人扣出来分别成png透",
        ratio: "16:9",
      },
    });
    const prompt = buildCopyAssistantPrompt(input);

    assert.equal(prompt.includes("六月一儿童节海报，品牌海报，医疗行业，帮我想出一个方案"), true);
    assert.equal(prompt.includes("主题优先级最高"), true);
    assert.equal(prompt.includes("项目上下文只是弱参考"), true);
    assert.equal(prompt.includes("当前尺寸/比例"), false);
    assert.equal(prompt.includes("尺寸和清晰度由用户在界面单独选择"), true);
    assert.equal(prompt.includes("visualDirection 简单说明这个方案的大致画面方向即可"), true);
    assert.equal(prompt.includes("designReason 用一句话说明为什么这个方案适合用户需求"), true);
    assert.equal(prompt.includes("suitableUse 用一句话说明适合的投放场景或阅读方式"), true);
  });

  it("keeps AI output structured when optional fields are incomplete", () => {
    const result = normalizeCopyAssistantResult({
      suggestions: [
        {
          title: "简洁版",
          copy: "品牌名称\n品质服务",
          designReason: "适合品牌基础宣传。",
          suitableUse: "适合朋友圈单图发布。",
        },
      ],
      followUpQuestions: ["是否需要补充品牌名称？"],
    });

    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].title, "简洁版");
    assert.equal(result.suggestions[0].designReason, "适合品牌基础宣传。");
    assert.equal(result.suggestions[0].suitableUse, "适合朋友圈单图发布。");
    assert.equal(result.suggestions[0].imagePrompt.length > 0, true);
    assert.deepEqual(result.followUpQuestions, ["是否需要补充品牌名称？"]);
  });

  it("does not invent local template suggestions when the model response is empty", () => {
    const result = normalizeCopyAssistantResult({});

    assert.deepEqual(result.suggestions, []);
    assert.deepEqual(result.followUpQuestions, []);
  });

  it("builds the final image prompt from the user request and editable copy", () => {
    const prompt = buildCopyAssistantImagePrompt({
      id: "option_1",
      title: "节日问候",
      copy: "童心飞扬\n健康相伴",
      visualDirection: "清新儿童插画，简洁亲和。",
      designReason: "",
      imagePrompt: "这段冗长的旧提示词不应继续传给图片模型。",
      missingInfo: [],
      suitableUse: "",
    }, "六月一儿童节海报，医疗行业品牌宣传");

    assert.equal(prompt, "用户需求：六月一儿童节海报，医疗行业品牌宣传\n选中设计方案：\n清新儿童插画，简洁亲和。\n画面文案：\n童心飞扬\n健康相伴");
    assert.equal(prompt.includes("设计参考"), false);
    assert.equal(prompt.includes("清新儿童插画"), true);
    assert.equal(prompt.includes("要求"), false);
    assert.equal(prompt.includes("冗长的旧提示词"), false);
  });

  it("runs accepted assistant suggestions through one text-to-image node", async () => {
    const workbenchSource = await readFile(new URL("../app/workbench-client.tsx", import.meta.url), "utf8");

    assert.equal(workbenchSource.includes("generateCopyAssistantPrompt(promptDraft)"), true);
    assert.equal(workbenchSource.includes("if (!options.createDirectionNodes) {\n      generateCopyAssistantPrompt(prompt);"), true);
    assert.equal(workbenchSource.includes('setStatus("已使用所选方案，创建一个文生图节点并开始运行。")'), true);
  });

  it("fills accepted assistant copy into a selected text-to-image node before running", async () => {
    const workbenchSource = await readFile(new URL("../app/workbench-client.tsx", import.meta.url), "utf8");

    assert.equal(workbenchSource.includes("function applyCopyAssistantPrompt(value: string)"), true);
    assert.equal(workbenchSource.includes('addNode("text_to_image", nextStandaloneNodePosition(), undefined, true'), true);
    assert.equal(workbenchSource.includes('updateNodeParam(targetNode.id, "prompt", prompt)'), true);
    assert.equal(workbenchSource.includes("setPendingRunNodeId(targetNode.id)"), false);
    assert.equal(workbenchSource.includes("现在可以连接参考图、选择素材、调整尺寸后再生成"), true);
  });

  it("shows assistant suggestions as editable design plans instead of raw prompts", async () => {
    const panelSource = await readFile(new URL("../components/workbench/copy-assistant-panel.tsx", import.meta.url), "utf8");

    assert.equal(panelSource.includes("适合场景"), true);
    assert.equal(panelSource.includes("设计判断"), true);
    assert.equal(panelSource.includes("设计方案 · 会一起给模型"), true);
    assert.equal(panelSource.includes("引用方案"), true);
    assert.equal(panelSource.includes("生成这张"), true);
    assert.equal(panelSource.includes("复杂提示词"), false);
  });

  it("lets the assistant text route fall back across text APIs", async () => {
    const routeSource = await readFile(new URL("../app/api/copy-assistant/route.ts", import.meta.url), "utf8");

    assert.equal(routeSource.includes("AuthRequiredError"), true);
    assert.equal(routeSource.includes("请先登录后再使用帮我想"), true);
    assert.equal(routeSource.includes("copyAssistantTextAttempts(config.wireApi)"), true);
    assert.equal(routeSource.includes("openai.chat.completions.create"), true);
    assert.equal(routeSource.includes("openai.responses.create"), true);
    assert.equal(routeSource.includes("文本模型不可用：${failures.join"), true);
  });

  it("adds a preflight design brief before image generation", async () => {
    const routeSource = await readFile(new URL("../app/api/generate-image/route.ts", import.meta.url), "utf8");

    assert.equal(routeSource.includes("buildPreflightDesignBrief(openai, body"), true);
    assert.equal(routeSource.includes("input: context.referenceImages.length"), true);
    assert.equal(routeSource.includes("{ type: \"input_text\", text: analysisPrompt }"), true);
    assert.equal(routeSource.includes(": analysisPrompt,"), true);
    assert.equal(routeSource.includes("你是商业海报设计分析师"), true);
    assert.equal(routeSource.includes("必须基于用户原文分析画面"), true);
    assert.equal(routeSource.includes("如果用户没有给完整画面文案，你必须自己补出适合画面的中文标题、副标题、短句和内容层级"), true);
    assert.equal(routeSource.includes("如果用户给了画面文案，则必须原文保留"), true);
    assert.equal(routeSource.includes("即使用户已经给了画面文案，也必须分析每句文案的含义、情绪、主次层级和适合承载它的视觉表达"), true);
    assert.equal(routeSource.includes("可见画面文案、主视觉、版式层级、色彩风格、画面元素和避免事项"), true);
    assert.equal(routeSource.includes("}).catch(() => \"\")"), true);
    assert.equal(routeSource.includes("maxRetries: 0"), true);
    assert.equal(routeSource.includes("GPT 没有返回画面分析方案，已停止出图"), false);
    assert.equal(routeSource.includes("body.prompt,"), true);
    assert.equal(routeSource.includes("GPT 设计方案：${context.preflightDesignBrief}"), true);
    assert.equal(routeSource.includes("referenceImages"), true);
    assert.equal(routeSource.includes("type: \"input_image\""), true);
    assert.equal(routeSource.includes("不要输出思考过程"), true);
    assert.equal(routeSource.includes("不要替用户改需求"), false);
    assert.equal(routeSource.includes("尺寸由系统参数控制"), false);
    assert.equal(routeSource.includes("请先分析图片内容、风格、可用素材"), false);
    assert.equal(routeSource.includes("function visibleCopyContract"), false);
    assert.equal(routeSource.includes("【必须出现的中文画面文案】"), false);
    assert.equal(routeSource.includes("不要翻译成英文，不要改写，不要省略，不要生成无字版本"), false);
  });
});
