/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Download, 
  Cpu, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  FileArchive,
  FileSpreadsheet,
  Check,
  ChevronDown,
  ChevronUp,
  Award
} from 'lucide-react';
import JSZip from 'jszip';

interface ProcessedFileResult {
  url: string;
  filename: string;
  success: boolean;
  parts: any[];
  records: {
    sourceUrl: string;
    generic: string;
    genericCode: string;
    productLifeCycle: string;
    modelType: string;
    modelNumber: string;
    modelLifeCycle: string;
  }[];
  error?: string;
}

export default function App() {
  const [urlsInput, setUrlsInput] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ProcessedFileResult[]>([]);
  const [downloadedZip, setDownloadedZip] = useState(false);
  const [downloadedCombined, setDownloadedCombined] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const sampleUrls = [
    'https://www.analog.com/cdp/ecommdata/en/mux08.js',
    'https://www.analog.com/cdp/ecommdata/evalboard/en/21262-ezlite.js?v99',
    'https://www.analog.com/cdp/ecommdata/en/73M2901CE.js',
    'https://www.analog.com/cdp/ecommdata/en/AD7510.js',
    'https://www.analog.com/cdp/ecommdata/en/ADG401.js'
  ];

  const extractItemsFromData = (d: any): any[] => {
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (typeof d === 'object') {
      if (d.generic || d.buyModels || d.evalModels || d.productLifeCycleStatus) {
        return [d];
      }
      for (const key of ['products', 'items', 'mux', 'data', 'parts', 'results', 'ecommData', 'catalog', 'content']) {
        if (d[key]) {
          const nested = extractItemsFromData(d[key]);
          if (nested.length > 0) return nested;
        }
      }
      const values = Object.values(d);
      for (const val of values) {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
          return val;
        }
      }
      return [d];
    }
    return [];
  };

  const handleProcessUrls = async () => {
    const rawLines = urlsInput
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && l.startsWith('http'));

    // Remove duplicate URLs to save resources
    const lines = Array.from(new Set(rawLines));

    if (lines.length === 0) {
      alert('Please enter at least one valid URL starting with https://');
      return;
    }

    setProcessing(true);
    setProgress({ current: 0, total: lines.length });
    setResults([]);
    setShowDetails(false);

    const processed: ProcessedFileResult[] = new Array(lines.length);
    let completedCount = 0;
    const concurrencyLimit = 5;
    let index = 0;

    const processNext = async (): Promise<void> => {
      if (index >= lines.length) return;
      const currentIndex = index++;
      const url = lines[currentIndex];
      
      let filename = url.split('/').pop() || `part_${currentIndex + 1}.js`;
      if (filename.includes('?')) filename = filename.split('?')[0];
      if (!filename.endsWith('.csv')) {
        filename = filename.replace(/\.[^/.]+$/, '') + '.csv';
      }

      try {
        const res = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        
        if (data.success && data.data) {
          const parts = extractItemsFromData(data.data);
          const records: ProcessedFileResult['records'] = [];

          if (parts.length === 0) {
            records.push({
              sourceUrl: url,
              generic: data.data.generic || 'UNKNOWN',
              genericCode: data.data.GenericCode || '',
              productLifeCycle: data.data.productLifeCycleStatus || '',
              modelType: 'N/A',
              modelNumber: '[ 0 Buy Models - No orderable models ]',
              modelLifeCycle: 'N/A'
            });
          } else {
            parts.forEach(part => {
              const generic = part.generic || '';
              const genericCode = part.GenericCode || '';
              const productLifeCycle = part.productLifeCycleStatus || '';

              const allModels: { model: string; lifeCycle: string; modelType: 'buyModel' | 'evalModel' }[] = [];
              const seenKeys = new Set<string>();

              const addModel = (m: any, modelType: 'buyModel' | 'evalModel') => {
                if (!m) return;
                const mName = (m.model || m.orderablePartNumber || m.name || '').trim();
                if (mName) {
                  const life = (m.lifeCycle || '').trim();
                  const key = `${mName.toLowerCase()}:::${life.toLowerCase()}:::${modelType}`;
                  if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    allModels.push({
                      model: mName,
                      lifeCycle: life,
                      modelType
                    });
                  }
                }
              };

              // 1. Process buyModels (standard purchase models)
              if (part.buyModels && Array.isArray(part.buyModels)) {
                part.buyModels.forEach((m: any) => addModel(m, 'buyModel'));
              }

              // 2. Process evalModels (evaluation board models)
              if (part.evalModels && Array.isArray(part.evalModels)) {
                part.evalModels.forEach((m: any) => addModel(m, 'evalModel'));
              }

              if (allModels.length > 0) {
                allModels.forEach(m => {
                  records.push({
                    sourceUrl: url,
                    generic,
                    genericCode,
                    productLifeCycle,
                    modelType: m.modelType,
                    modelNumber: m.model,
                    modelLifeCycle: m.lifeCycle
                  });
                });
              } else {
                // Explicitly state 0 buy models in modelNumber column
                records.push({
                  sourceUrl: url,
                  generic,
                  genericCode,
                  productLifeCycle,
                  modelType: 'N/A',
                  modelNumber: '[ 0 Buy Models - No orderable models ]',
                  modelLifeCycle: 'N/A'
                });
              }
            });
          }

          processed[currentIndex] = {
            url,
            filename,
            success: true,
            parts,
            records
          };
        } else {
          const errMsg = data.error || 'Failed to fetch or parse endpoint (404/Error)';
          processed[currentIndex] = {
            url,
            filename,
            success: false,
            parts: [],
            records: [{
              sourceUrl: url,
              generic: `ERROR: ${errMsg}`,
              genericCode: '',
              productLifeCycle: '',
              modelType: 'ERROR',
              modelNumber: '[ FETCH FAILED / 404 ]',
              modelLifeCycle: 'ERROR'
            }],
            error: errMsg
          };
        }
      } catch (err: any) {
        const errMsg = err.message || 'Network error';
        processed[currentIndex] = {
          url,
          filename,
          success: false,
          parts: [],
          records: [{
            sourceUrl: url,
            generic: `ERROR: ${errMsg}`,
            genericCode: '',
            productLifeCycle: '',
            modelType: 'ERROR',
            modelNumber: '[ NETWORK ERROR ]',
            modelLifeCycle: 'ERROR'
          }],
          error: errMsg
        };
      }

      completedCount++;
      setProgress({ current: completedCount, total: lines.length });

      if (index < lines.length) {
        return processNext();
      }
    };

    const workers = Array(Math.min(concurrencyLimit, lines.length))
      .fill(null)
      .map(() => processNext());

    await Promise.all(workers);

    setResults(processed);
    setProcessing(false);
  };

  const generateCsvContent = (records: ProcessedFileResult['records']) => {
    const csvRows = [
      'SourceURL,Generic,GenericCode,ProductLifeCycle,ModelType,ModelNumber,ModelLifeCycle'
    ];

    records.forEach(rec => {
      const row = [
        rec.sourceUrl,
        rec.generic,
        rec.genericCode,
        rec.productLifeCycle,
        rec.modelType,
        rec.modelNumber,
        rec.modelLifeCycle
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
      csvRows.push(row);
    });

    return csvRows.join('\n');
  };

  const handleDownloadCombinedCSV = () => {
    const allRecords: ProcessedFileResult['records'] = [];
    results.forEach(res => {
      allRecords.push(...res.records);
    });

    if (allRecords.length === 0) {
      alert('No data available for export');
      return;
    }

    const csvText = generateCsvContent(allRecords);
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'analog_buyModels_combined.csv';
    a.click();
    URL.revokeObjectURL(downloadUrl);
    setDownloadedCombined(true);
  };

  const handleDownloadZip = async () => {
    if (results.length === 0) {
      alert('No files to zip');
      return;
    }

    const zip = new JSZip();

    results.forEach(res => {
      const csvContent = generateCsvContent(res.records);
      zip.file(res.filename, csvContent);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const downloadUrl = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'analog_parts_csv_files.zip';
    a.click();
    URL.revokeObjectURL(downloadUrl);
    setDownloadedZip(true);
  };

  const totalRecordsCount = results.reduce((acc, r) => acc + r.records.length, 0);
  const successCount = results.filter(r => r.success).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">Analog Devices Batch CSV Extractor</h1>
              <p className="text-xs text-slate-500">Extract URLs to CSV / ZIP with strict schema</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        
        {/* Input Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Target URLs</h2>
            <p className="text-sm text-slate-500">Enter one URL per line. Output columns: SourceURL, Generic, GenericCode, ProductLifeCycle, ModelType, ModelNumber, ModelLifeCycle.</p>
          </div>

          <div className="space-y-3">
            <textarea
              rows={6}
              value={urlsInput}
              onChange={(e) => setUrlsInput(e.target.value)}
              placeholder="https://www.analog.com/cdp/ecommdata/en/mux08.js&#10;https://www.analog.com/cdp/ecommdata/evalboard/en/21262-ezlite.js?v99&#10;https://www.analog.com/cdp/ecommdata/en/AD7510.js&#10;https://www.analog.com/cdp/ecommdata/en/ADG401.js"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium mr-1">Quick Sample URLs:</span>
                {sampleUrls.map((sUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (!urlsInput.includes(sUrl)) {
                        setUrlsInput(prev => (prev ? prev + '\n' + sUrl : sUrl));
                      }
                    }}
                    className="bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 px-2.5 py-1 rounded-lg transition-colors font-mono text-[11px]"
                  >
                    +{sUrl.split('/').pop()?.split('?')[0]}
                  </button>
                ))}
              </div>

              <button
                onClick={handleProcessUrls}
                disabled={processing}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition-all shadow-sm flex items-center space-x-2"
              >
                {processing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />
                    <span>Processing ({progress.current}/{progress.total})...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                    <span>Process & Generate CSV / ZIP</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results & Download Section */}
        {results.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Extraction Complete</h3>
                <p className="text-xs text-slate-500">
                  Processed {results.length} URLs ({successCount} successful, {results.length - successCount} failed/404 included in output)
                </p>
              </div>

              {/* Action Download Buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleDownloadCombinedCSV}
                  disabled={totalRecordsCount === 0}
                  className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 transition-all shadow-sm"
                >
                  {downloadedCombined ? <Check className="w-4 h-4 text-emerald-400" /> : <FileSpreadsheet className="w-4 h-4 mr-1.5 text-blue-400" />}
                  <span>Download Combined CSV</span>
                </button>

                <button
                  onClick={handleDownloadZip}
                  disabled={totalRecordsCount === 0}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 transition-all shadow-sm"
                >
                  {downloadedZip ? <Check className="w-4 h-4 text-emerald-200" /> : <FileArchive className="w-4 h-4 mr-1.5" />}
                  <span>Download ZIP (Separate CSVs)</span>
                </button>
              </div>
            </div>

            {/* Toggle Button for Details */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center space-x-1.5 transition-colors"
              >
                <span>{showDetails ? 'Hide Processed URLs Status' : 'Show Processed URLs Status'}</span>
                {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <span className="text-xs text-slate-400 font-mono">Schema: SourceURL, Generic, GenericCode, ProductLifeCycle, ModelType, ModelNumber, ModelLifeCycle</span>
            </div>

            {/* Collapsible List of processed files */}
            {showDetails && (
              <div className="space-y-3 pt-2 max-h-80 overflow-y-auto pr-1">
                {results.map((res, idx) => (
                  <div key={idx} className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                    res.success ? 'bg-slate-50 border-slate-200' : 'bg-rose-50 border-rose-200'
                  }`}>
                    <div className="space-y-1 overflow-hidden">
                      <div className="flex items-center space-x-2 font-mono text-slate-900 font-bold truncate">
                        {res.success ? (
                           <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span className="truncate">{res.url}</span>
                      </div>
                      {res.success ? (
                        <div className="flex flex-wrap items-center gap-2 text-slate-600">
                          <span>CSV: <strong className="font-mono text-slate-800">{res.filename}</strong></span>
                          <span>| Records: <strong className="text-emerald-700">{res.records.length}</strong></span>
                          {res.records.some(r => r.modelType === 'buyModel') && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                              buyModel ({res.records.filter(r => r.modelType === 'buyModel').length})
                            </span>
                          )}
                          {res.records.some(r => r.modelType === 'evalModel') && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                              evalModel ({res.records.filter(r => r.modelType === 'evalModel').length})
                            </span>
                          )}
                          {res.records.some(r => r.modelNumber.includes('0 Buy Models')) && (
                            <span className="text-amber-600 font-semibold">(Contains 0 Buy Models)</span>
                          )}
                        </div>
                      ) : (
                        <p className="text-rose-700 font-medium">Error: {res.error} (Included in output as error record)</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-xs text-slate-500 space-y-1">
        <p>Analog Devices Batch CSV Extractor — Clean CSV & ZIP generator with strict schema.</p>
        <p className="font-semibold text-blue-600">Designed & Developed By Eng Ahmed Bahgat</p>
      </footer>
    </div>
  );
}
