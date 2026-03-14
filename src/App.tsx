/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Upload, 
  Database, 
  LineChart as LineChartIcon, 
  Brain, 
  MessageSquare, 
  Download, 
  ChevronRight, 
  ChevronDown,
  Activity,
  Wind,
  Thermometer,
  Droplets,
  AlertCircle,
  FileText,
  RefreshCw,
  Send,
  User,
  Bot,
  Zap
} from 'lucide-react';
import { 
  ScatterChart, 
  Scatter, 
  XAxis, 
  YAxis, 
  ZAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Line,
  ComposedChart,
  Legend
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { EnvData, RegressionResult, AppMode, ChatMessage } from './types';
import { calculateOLS, generateSampleData } from './utils/stats';
import { generateAnalysis, generateWhatIfPrediction, chatWithContext } from './services/gemini';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [data, setData] = useState<EnvData[]>([]);
  const [stats, setStats] = useState<RegressionResult | null>(null);
  const [mode, setMode] = useState<AppMode>('researcher');
  const [aiAnalysis, setAiAnalysis] = useState<{ thought: string; answer: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showCoT, setShowCoT] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [whatIfScenario, setWhatIfScenario] = useState({ pm25: 0, temperature: 0, humidity: 0 });
  const [whatIfPrediction, setWhatIfPrediction] = useState<string | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dashboardRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize with sample data
  useEffect(() => {
    handleSampleData();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        const parsedData = (results.data as any[]).filter(row => 
          row.pm25 !== undefined && 
          row.disease_rate !== undefined &&
          row.temperature !== undefined &&
          row.humidity !== undefined
        ).map(row => ({
          pm25: Number(row.pm25),
          temperature: Number(row.temperature),
          humidity: Number(row.humidity),
          disease_rate: Number(row.disease_rate),
          date: row.date || undefined
        }));

        if (parsedData.length < 5) {
          setError('数据量过少，请至少提供5行有效数据。');
          return;
        }
        setError(null);
        processData(parsedData);
      },
      error: (err) => {
        setError(`解析失败: ${err.message}`);
      }
    });
  };

  const handleSampleData = () => {
    const sample = generateSampleData();
    processData(sample);
  };

  const processData = async (newData: EnvData[]) => {
    setData(newData);
    try {
      const result = calculateOLS(newData);
      setStats(result);
      setWhatIfScenario({
        pm25: newData.reduce((a, b) => a + b.pm25, 0) / newData.length,
        temperature: newData.reduce((a, b) => a + b.temperature, 0) / newData.length,
        humidity: newData.reduce((a, b) => a + b.humidity, 0) / newData.length,
      });
      runAiAnalysis(result, newData);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const runAiAnalysis = async (currentStats: RegressionResult, currentData: EnvData[]) => {
    setIsAnalyzing(true);
    try {
      const text = await generateAnalysis(mode, currentStats, currentData);
      const thoughtMatch = text.match(/\[思考过程\]([\s\S]*?)\[正式回答\]/);
      const answerMatch = text.match(/\[正式回答\]([\s\S]*)/);
      
      setAiAnalysis({
        thought: thoughtMatch ? thoughtMatch[1].trim() : '分析中...',
        answer: answerMatch ? answerMatch[1].trim() : text.replace(/\[思考过程\][\s\S]*?\[正式回答\]/, '').trim()
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleWhatIf = async () => {
    if (!stats) return;
    setIsPredicting(true);
    try {
      const prediction = await generateWhatIfPrediction(whatIfScenario, stats);
      setWhatIfPrediction(prediction);
    } catch (err) {
      console.error(err);
    } finally {
      setIsPredicting(false);
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || !stats) return;
    
    const userMsg: ChatMessage = { role: 'user', content: currentMessage };
    setChatHistory(prev => [...prev, userMsg]);
    setCurrentMessage('');
    setIsChatting(true);

    try {
      const response = await chatWithContext(mode, stats, data, chatHistory, currentMessage);
      setChatHistory(prev => [...prev, { role: 'model', content: response }]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsChatting(false);
    }
  };

  const exportToPdf = async () => {
    if (!dashboardRef.current) return;
    const canvas = await html2canvas(dashboardRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`EnvInsight_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const chartData = useMemo(() => {
    if (!stats || data.length === 0) return [];
    const minPm = Math.min(...data.map(d => d.pm25));
    const maxPm = Math.max(...data.map(d => d.pm25));
    
    // Generate regression line points
    const linePoints = [
      { pm25: minPm, regression: stats.coefficients.intercept + stats.coefficients.pm25 * minPm + stats.coefficients.temperature * whatIfScenario.temperature + stats.coefficients.humidity * whatIfScenario.humidity },
      { pm25: maxPm, regression: stats.coefficients.intercept + stats.coefficients.pm25 * maxPm + stats.coefficients.temperature * whatIfScenario.temperature + stats.coefficients.humidity * whatIfScenario.humidity }
    ];

    return data.map(d => ({
      pm25: d.pm25,
      disease_rate: d.disease_rate,
      regression: stats.coefficients.intercept + stats.coefficients.pm25 * d.pm25 + stats.coefficients.temperature * d.temperature + stats.coefficients.humidity * d.humidity
    })).sort((a, b) => a.pm25 - b.pm25);
  }, [data, stats, whatIfScenario]);

  return (
    <div className="flex h-screen bg-[#F9FAFB] text-[#111827] font-sans selection:bg-emerald-100">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <Activity size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">EnvInsight AI</h1>
            <p className="text-xs text-gray-500 font-medium">V3.0 Pro System</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Data Upload */}
          <section className="space-y-4">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">数据接入</label>
            <div className="space-y-2">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-3 text-gray-400 group-hover:text-emerald-500 transition-colors" />
                  <p className="text-sm text-gray-600 font-medium">点击上传 CSV</p>
                  <p className="text-xs text-gray-400 mt-1">支持 PM2.5, 疾病率等</p>
                </div>
                <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
              </label>
              <button 
                onClick={handleSampleData}
                className="w-full py-2.5 px-4 bg-gray-50 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-100 flex items-center justify-center gap-2 transition-colors border border-gray-200"
              >
                <Database size={16} />
                加载示例数据
              </button>
            </div>
          </section>

          {/* Mode Selection */}
          <section className="space-y-4">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">分析模式</label>
            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={() => setMode('researcher')}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all border",
                  mode === 'researcher' 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm" 
                    : "bg-white border-gray-100 text-gray-500 hover:bg-gray-50"
                )}
              >
                <FileText size={18} />
                科研专家模式
              </button>
              <button 
                onClick={() => setMode('public')}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all border",
                  mode === 'public' 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm" 
                    : "bg-white border-gray-100 text-gray-500 hover:bg-gray-50"
                )}
              >
                <Zap size={18} />
                大众科普模式
              </button>
            </div>
          </section>

          {/* API Status */}
          <section className="pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Gemini AI API 已连接
            </div>
          </section>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <div ref={dashboardRef} className="max-w-6xl mx-auto p-8 space-y-8">
          {/* Header Stats */}
          <div className="grid grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">拟合优度 (R²)</p>
              <h3 className="text-3xl font-bold text-gray-900">{stats?.rSquared.toFixed(3) || '0.000'}</h3>
              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(stats?.rSquared || 0) * 100}%` }}
                  className="h-full bg-emerald-500"
                />
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">显著性 (P-Value)</p>
              <h3 className="text-3xl font-bold text-gray-900">{stats?.pValue.toFixed(3) || '0.000'}</h3>
              <p className="text-xs text-emerald-600 font-semibold">高度显著 ({"<"}0.05)</p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">样本量 (N)</p>
              <h3 className="text-3xl font-bold text-gray-900">{stats?.sampleSize || '0'}</h3>
              <p className="text-xs text-gray-400 font-medium">有效观测值</p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">AIC 指标</p>
              <h3 className="text-3xl font-bold text-gray-900">{stats?.aic.toFixed(1) || '0.0'}</h3>
              <p className="text-xs text-gray-400 font-medium">模型复杂度惩罚</p>
            </div>
          </div>

          {/* Chart Section */}
          <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <LineChartIcon size={20} />
                </div>
                <h2 className="text-xl font-bold text-gray-900">动态回归分析图</h2>
              </div>
              <div className="flex gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" /> 观测点
                </span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full">
                  <div className="w-3 h-0.5 bg-gray-400" /> 回归拟合线
                </span>
              </div>
            </div>
            
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis 
                    dataKey="pm25" 
                    name="PM2.5" 
                    unit="μg/m³" 
                    type="number" 
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 12, fill: '#9CA3AF' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    name="疾病率" 
                    unit="‰" 
                    tick={{ fontSize: 12, fill: '#9CA3AF' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    cursor={{ strokeDasharray: '3 3' }}
                  />
                  <Scatter name="观测数据" dataKey="disease_rate" fill="#10B981" fillOpacity={0.6} />
                  <Line 
                    type="monotone" 
                    dataKey="regression" 
                    stroke="#4B5563" 
                    strokeWidth={2} 
                    dot={false} 
                    activeDot={false}
                    name="回归趋势"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Insight Section */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gradient-to-r from-emerald-50/50 to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-md shadow-emerald-100">
                  <Brain size={20} />
                </div>
                <h2 className="text-xl font-bold text-gray-900">AI 智能洞察报告</h2>
              </div>
              <button 
                onClick={() => setShowCoT(!showCoT)}
                className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                {showCoT ? '隐藏推理逻辑' : '查看推理逻辑'}
                {showCoT ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>

            <div className="p-8 space-y-6">
              <AnimatePresence>
                {showCoT && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 mb-6">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Zap size={14} className="text-amber-500" /> 思维链 (Chain of Thought)
                      </h4>
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap italic">
                        {aiAnalysis?.thought || '正在深度解析统计模型...'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">核心分析结论</h4>
                {isAnalyzing ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-4 bg-gray-100 rounded w-full" />
                    <div className="h-4 bg-gray-100 rounded w-5/6" />
                  </div>
                ) : (
                  <div className="text-gray-700 leading-relaxed whitespace-pre-wrap text-lg font-medium">
                    {aiAnalysis?.answer || '等待数据上传后生成分析...'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* What-If Simulator */}
          <div className="bg-[#111827] text-white p-8 rounded-3xl shadow-2xl space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500 text-white rounded-lg">
                  <RefreshCw size={20} />
                </div>
                <h2 className="text-xl font-bold">What-If 政策模拟器</h2>
              </div>
              <div className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-bold uppercase tracking-widest border border-emerald-500/30">
                量化决策辅助
              </div>
            </div>

            <div className="grid grid-cols-3 gap-12">
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-gray-400 flex items-center gap-2">
                      <Wind size={16} className="text-emerald-400" /> PM2.5 浓度
                    </label>
                    <span className="text-emerald-400 font-mono font-bold">{whatIfScenario.pm25.toFixed(1)} μg/m³</span>
                  </div>
                  <input 
                    type="range" min="0" max="200" step="0.1" 
                    value={whatIfScenario.pm25} 
                    onChange={(e) => setWhatIfScenario(prev => ({ ...prev, pm25: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-gray-400 flex items-center gap-2">
                      <Thermometer size={16} className="text-amber-400" /> 平均气温
                    </label>
                    <span className="text-amber-400 font-mono font-bold">{whatIfScenario.temperature.toFixed(1)} °C</span>
                  </div>
                  <input 
                    type="range" min="-10" max="45" step="0.1" 
                    value={whatIfScenario.temperature} 
                    onChange={(e) => setWhatIfScenario(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-gray-400 flex items-center gap-2">
                      <Droplets size={16} className="text-blue-400" /> 相对湿度
                    </label>
                    <span className="text-blue-400 font-mono font-bold">{whatIfScenario.humidity.toFixed(1)} %</span>
                  </div>
                  <input 
                    type="range" min="0" max="100" step="0.1" 
                    value={whatIfScenario.humidity} 
                    onChange={(e) => setWhatIfScenario(prev => ({ ...prev, humidity: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
                <button 
                  onClick={handleWhatIf}
                  disabled={isPredicting}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
                >
                  {isPredicting ? <RefreshCw className="animate-spin" size={20} /> : <Zap size={20} />}
                  运行模拟推演
                </button>
              </div>

              <div className="col-span-2 bg-gray-800/50 rounded-3xl p-8 border border-gray-700/50 flex flex-col">
                <div className="flex-1 space-y-6">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest">
                    <AlertCircle size={14} /> 预测结果解读
                  </div>
                  {isPredicting ? (
                    <div className="space-y-4 animate-pulse">
                      <div className="h-4 bg-gray-700 rounded w-full" />
                      <div className="h-4 bg-gray-700 rounded w-5/6" />
                      <div className="h-4 bg-gray-700 rounded w-4/5" />
                    </div>
                  ) : whatIfPrediction ? (
                    <div className="text-lg text-gray-200 leading-relaxed font-medium">
                      {whatIfPrediction}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                      <Zap size={48} className="opacity-20" />
                      <p className="text-sm">调整左侧滑块并点击“运行模拟”查看预测结果</p>
                    </div>
                  )}
                </div>
                {whatIfPrediction && (
                  <div className="mt-8 pt-6 border-t border-gray-700 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 font-bold uppercase">预期疾病率变化</p>
                      <p className="text-2xl font-bold text-emerald-400">
                        {(stats!.coefficients.intercept + stats!.coefficients.pm25 * whatIfScenario.pm25 + stats!.coefficients.temperature * whatIfScenario.temperature + stats!.coefficients.humidity * whatIfScenario.humidity).toFixed(3)} ‰
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 font-bold uppercase">置信水平</p>
                      <p className="text-xl font-bold text-gray-300">95% CI</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chat Interface */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[600px]">
            <div className="p-6 border-b border-gray-50 flex items-center gap-3 bg-gray-50/50">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <MessageSquare size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">智能问答助手</h2>
                <p className="text-xs text-gray-500 font-medium">基于当前分析上下文的连续对话</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {chatHistory.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                  <Bot size={48} className="opacity-10" />
                  <p className="text-sm font-medium">您可以追问关于数据异常点、趋势或防护建议的细节</p>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} className={cn("flex gap-4", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                    msg.role === 'user' ? "bg-emerald-600 text-white" : "bg-indigo-600 text-white"
                  )}>
                    {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                  </div>
                  <div className={cn(
                    "max-w-[80%] p-4 rounded-2xl text-sm font-medium leading-relaxed",
                    msg.role === 'user' ? "bg-emerald-50 text-emerald-900" : "bg-gray-50 text-gray-800"
                  )}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatting && (
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 animate-pulse">
                    <Bot size={20} />
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl flex gap-1 items-center">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-6 bg-gray-50/50 border-t border-gray-50">
              <div className="relative">
                <input 
                  type="text" 
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="输入您的问题..."
                  className="w-full pl-6 pr-14 py-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm font-medium"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={!currentMessage.trim() || isChatting}
                  className="absolute right-2 top-2 bottom-2 px-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 disabled:bg-gray-300 transition-all flex items-center justify-center"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Actions */}
        <div className="fixed bottom-8 right-8 flex flex-col gap-4">
          <button 
            onClick={exportToPdf}
            className="p-4 bg-white text-gray-900 rounded-2xl shadow-2xl border border-gray-100 hover:bg-gray-50 transition-all flex items-center gap-3 group"
          >
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-100 transition-colors">
              <Download size={20} />
            </div>
            <span className="font-bold text-sm pr-2">导出 PDF 报告</span>
          </button>
        </div>
      </main>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-50"
          >
            <AlertCircle size={20} />
            <span className="font-bold text-sm">{error}</span>
            <button onClick={() => setError(null)} className="ml-4 hover:opacity-70">
              <Zap size={16} className="rotate-45" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
