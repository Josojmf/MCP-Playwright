import { useState } from 'react'
import { 
  Play, RotateCcw, Monitor, FileCode, CheckCircle2, 
  Settings, History, ChevronRight, Activity, Cpu, X, Terminal,
  Layers, Hexagon
} from 'lucide-react'

function App() {
  const [editorValue, setEditorValue] = useState(`Feature: Demo Scenario\n  Scenario: basic interaction\n    Given I load "https://example.com"\n    Then I should see the URL "https://example.com"`)
  const [urlValue, setUrlValue] = useState('https://example.com')
  const [darkMode, setDarkMode] = useState(true)
  
  const mcpList = [
    { id: '@playwright/mcp', label: '@playwright/mcp (ARIA snapshot)', engine: 'Microsoft', default: true },
    { id: 'puppeteer', label: '@modelcontextprotocol/server-puppeteer', engine: 'Anthropic', default: true },
    { id: 'mcp-playwright', label: 'mcp-playwright (ExecuteAutomation)', engine: 'Community', default: false },
    { id: 'browserbase', label: '@browserbasehq/mcp', engine: 'Cloud Proxy', default: false },
  ]
  const [selectedMCPs, setSelectedMCPs] = useState<Record<string, boolean>>({
    '@playwright/mcp': true,
    'puppeteer': true,
  })

  // Datadog premium aesthetic:
  // Clean, high density, technical typography, deep slates, bright interactive state colors.
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setEditorValue(evt.target?.result as string);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  }

  const toggleMcp = (id: string) => {
    setSelectedMCPs(prev => ({...prev, [id]: !prev[id]}))
  }

  const wrapperClass = darkMode ? "dark bg-[#0f1118] text-slate-50 min-h-screen font-sans selection:bg-indigo-500/30" : "bg-slate-50 text-slate-900 min-h-screen font-sans selection:bg-indigo-200"
  
  return (
    <div className={wrapperClass}>
      <div className="flex h-screen overflow-hidden">
        
        {/* Sidebar Nav */}
        <aside className="w-64 border-r border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#151924] flex flex-col shadow-sm z-10 transition-colors duration-200">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800/60 flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Hexagon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-[15px] tracking-tight text-slate-900 dark:text-slate-100">MCP Bench</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-widest mt-0.5">Test Playground</p>
            </div>
          </div>
          
          <nav className="flex-1 p-3 space-y-1">
            <button className="w-full flex items-center space-x-3 px-3 py-2.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 rounded-md text-sm font-semibold transition-all">
              <Play className="w-4 h-4" />
              <span>New Run</span>
            </button>
            <button className="w-full flex items-center space-x-3 px-3 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-md text-sm font-medium transition-all group">
              <History className="w-4 h-4 group-hover:text-slate-900 dark:group-hover:text-slate-200" />
              <span className="group-hover:text-slate-900 dark:group-hover:text-slate-200">Run History</span>
            </button>
            <button className="w-full flex items-center space-x-3 px-3 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-md text-sm font-medium transition-all group">
              <Settings className="w-4 h-4 group-hover:text-slate-900 dark:group-hover:text-slate-200" />
              <span className="group-hover:text-slate-900 dark:group-hover:text-slate-200">Platform Settings</span>
            </button>
          </nav>
          
          <div className="p-4 border-t border-slate-200 dark:border-slate-800/60">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Theme</span>
              <button 
                onClick={() => setDarkMode(!darkMode)}
                className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              >
                <span className="sr-only">Toggle dark mode</span>
                <span className={`pointer-events-none absolute h-full w-full rounded-full transition-colors duration-200 ease-in-out ${darkMode ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                <span className={`pointer-events-none absolute left-0 inline-block h-5 w-5 transform rounded-full border border-slate-200 dark:border-slate-700 bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${darkMode ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            
            <div className="mt-4 flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-500 px-2 justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span>Engine Ready</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto bg-slate-50 dark:bg-[#0f1118] transition-colors duration-200">
          
          {/* Topbar/Header */}
          <header className="sticky top-0 z-10 bg-slate-50/80 dark:bg-[#0f1118]/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/60 p-5 px-8 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center">
                Configure Benchmark
                <span className="ml-3 inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-500/20 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                  Ready
                </span>
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-cente