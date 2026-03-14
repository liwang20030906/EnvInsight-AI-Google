import { GoogleGenAI } from "@google/genai";
import { AppMode, EnvData, RegressionResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function generateAnalysis(
  mode: AppMode,
  stats: RegressionResult,
  dataSample: EnvData[],
  userQuery?: string
) {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: mode === 'researcher' 
        ? `你是首席环境数据科学家，擅长统计推断与流行病学归因分析。
           Task: 基于提供的 OLS 回归统计摘要和数据预览，进行深度解读。
           Constraints:
           1. 必须严格基于统计数据说话，严禁幻觉。若 P > 0.05，明确指出“统计上不显著”。
           2. 输出必须包含两个部分：
              - [思考过程]: 简要分析模型拟合度、识别潜在的多重共线性或异常离群点、推导因果逻辑。
              - [正式回答]: 使用学术严谨的语言，给出结论、局限性分析及后续研究建议。
           3. 语气：客观、冷静、专业，多用术语（如“显著正相关”、“置信区间”）。`
        : `你是亲切的健康生活顾问，擅长将复杂的数据转化为通俗易懂的生活建议。
           Task: 基于环境数据，告诉普通大众当前的健康风险及防护措施。
           Constraints:
           1. 禁止使用 P 值、回归系数等统计术语，转化为“可能性很大”、“影响明显”等自然语言。
           2. 重点在于“行动建议”（如：戴口罩、减少户外运动）。
           3. 输出必须包含：
              - [思考过程]: 简单联想数据与生活场景的关联。
              - [正式回答]: 温暖、关怀的语气，分点列出风险和建议。
           4. 若数据表明风险低，也要给予安心的提示。`,
    },
    contents: `统计摘要: ${JSON.stringify(stats, null, 2)}
               数据预览: ${JSON.stringify(dataSample.slice(0, 5), null, 2)}
               ${userQuery ? `用户问题: ${userQuery}` : "请生成初始分析报告。"}`,
  });

  const response = await model;
  return response.text;
}

export async function generateWhatIfPrediction(
  scenario: { pm25: number; temperature: number; humidity: number },
  stats: RegressionResult
) {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Task: 用户设定了环境变量的变化情景：${JSON.stringify(scenario)}。
               请结合之前的回归系数（例如：PM2.5 系数为 ${stats.coefficients.pm25}），计算因变量（疾病率）的理论变化值。
               Logic:
               1. 计算：变化量 = 系数 * 变量变化幅度。
               2. 解读：将此数值转化为具体的公共卫生意义（如：预计每万人减少 X 例发病）。
               3. 评价：这是一个积极的改善还是恶化的趋势？
               Output: 直接给出推演结论，强调政策干预的潜在价值。`,
  });

  const response = await model;
  return response.text;
}

export async function chatWithContext(
  mode: AppMode,
  stats: RegressionResult,
  dataSample: EnvData[],
  history: { role: 'user' | 'model'; content: string }[],
  message: string
) {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: mode === 'researcher' 
        ? "你是首席环境数据科学家，基于当前统计上下文进行专业问答。" 
        : "你是亲切的健康生活顾问，基于当前环境数据提供生活建议。",
    },
  });

  // Simplified context injection for chat
  const context = `当前统计摘要: ${JSON.stringify(stats, null, 2)}\n数据预览: ${JSON.stringify(dataSample.slice(0, 5), null, 2)}`;
  
  // Send context first or as part of the first message if history is empty
  let response;
  if (history.length === 0) {
    response = await chat.sendMessage({ message: `${context}\n\n用户问题: ${message}` });
  } else {
    // In a real app, we'd feed history to the chat object
    // For simplicity, we'll just send the current message with context
    response = await chat.sendMessage({ message: `${context}\n\n用户问题: ${message}` });
  }

  return response.text;
}
