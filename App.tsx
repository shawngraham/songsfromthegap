
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WikiArticle, Gap, SongSession, GeneratedVoice } from './types';
import { fetchNearbyArticles } from './services/wikipedia';
import { MultiVoicePlayer } from './services/audio';
import Visualizer from './components/Visualizer';

const App: React.FC = () => {
  const [coords, setCoords] = useState<{lat: number, lon: number} | null>(null);
  const [articles, setArticles] = useState<WikiArticle[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [samplesLoading, setSamplesLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  
  const [searchLat, setSearchLat] = useState<string>('');
  const [searchLon, setSearchLon] = useState<string>('');
  const [searchRadius, setSearchRadius] = useState<string>('5000');
  const [showSearch, setShowSearch] = useState<boolean>(false);

  const [origin, setOrigin] = useState<WikiArticle | undefined>();
  const [target, setTarget] = useState<WikiArticle | undefined>();
  const [session, setSession] = useState<SongSession | null>(null);
  
  const playerRef = useRef<MultiVoicePlayer | null>(null);

  useEffect(() => {
    playerRef.current = new MultiVoicePlayer();
    playerRef.current.loadSamples().then(() => {
      setSamplesLoading(false);
    });
    return () => playerRef.current?.stop();
  }, []);

  const getNearby = useCallback(async (lat: number, lon: number, radius: number = 5000) => {
    setLoading(true);
    setOrigin(undefined);
    setTarget(undefined);
    setSession(null);
    const results = await fetchNearbyArticles(lat, lon, radius);
    setArticles(results);
    setLoading(false);
  }, []);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(searchLat);
    const lon = parseFloat(searchLon);
    const rad = parseInt(searchRadius);
    if (!isNaN(lat) && !isNaN(lon)) {
      setCoords({ lat, lon });
      getNearby(lat, lon, isNaN(rad) ? 5000 : rad);
      setShowSearch(false);
    }
  };

  const initLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setCoords(newCoords);
        setSearchLat(newCoords.lat.toFixed(4));
        setSearchLon(newCoords.lon.toFixed(4));
        getNearby(newCoords.lat, newCoords.lon, parseInt(searchRadius) || 5000);
      },
      () => {
        const defaultCoords = { lat: 48.8584, lon: 2.2945 };
        setCoords(defaultCoords);
        setSearchLat(defaultCoords.lat.toString());
        setSearchLon(defaultCoords.lon.toString());
        getNearby(defaultCoords.lat, defaultCoords.lon, parseInt(searchRadius) || 5000);
      }
    );
  };

  const handleSelectNode = (article: WikiArticle) => {
    playerRef.current?.stop();
    if (!origin || (origin && target)) {
      setOrigin(article);
      setTarget(undefined);
      setSession(null);
    } else if (origin.pageid === article.pageid) {
      setOrigin(undefined);
    } else {
      setTarget(article);
    }
  };

  useEffect(() => {
    if (origin && target) {
      const intersection = [...origin.links].filter(x => target.links.has(x));
      const union = origin.links.size + target.links.size - intersection.length;
      const similarity = union === 0 ? 0 : intersection.length / union;

      const gap: Gap = {
        id: `${origin.pageid}-${target.pageid}`,
        from: origin,
        to: target,
        center: [(origin.vector[0] + target.vector[0]) / 2, (origin.vector[1] + target.vector[1]) / 2],
        distance: Math.sqrt((origin.vector[0] - target.vector[0]) ** 2 + (origin.vector[1] - target.vector[1]) ** 2),
        semanticSimilarity: similarity,
        sharedLinks: intersection
      };

      const voices: GeneratedVoice[] = [
        { role: 'bass', audioBuffer: null, text: `Solo Cello: ${origin.title}`, voiceName: 'Philharmonia Bass' },
        { role: 'harmony', audioBuffer: null, text: `Strings: ${target.title}`, voiceName: 'Ensemble Wash' },
        { role: 'melody', audioBuffer: null, text: `Celesta: ${intersection.length} intersection${intersection.length === 1 ? '' : 's'}`, voiceName: 'Glassworks' }
      ];

      setSession({ gap, voices, isGenerating: false, isPlaying: false });
    }
  }, [origin, target]);

  const playSong = async () => {
    if (!session || !playerRef.current) return;
    setSession(prev => prev ? ({ ...prev, isPlaying: true }) : null);
    await playerRef.current.playSync(session.gap, () => {
      setSession(prev => prev ? ({ ...prev, isPlaying: false }) : null);
    });
  };

  const stopSong = () => {
    playerRef.current?.stop();
    setSession(prev => prev ? ({ ...prev, isPlaying: false }) : null);
  };

  const handleExport = async () => {
    if (!session || !playerRef.current) return;
    setExporting(true);
    try {
      await playerRef.current.exportWav(session.gap);
    } catch(e) {
      console.error("Export failed", e);
    }
    setExporting(false);
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] overflow-hidden selection:bg-white/20 bg-[#050505]">
      {samplesLoading && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-8">
          <div className="text-center space-y-4 max-w-xs">
            <div className="w-12 h-12 border-b-2 border-white rounded-full animate-spin mx-auto mb-6"></div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-white/40 font-bold">Initializing Acoustic Manifold</p>
            <p className="text-[11px] text-white/20 italic leading-relaxed">Downloading and decoding instrument samples from the cloud...</p>
          </div>
        </div>
      )}

      <header className="flex justify-between items-center px-4 md:px-8 py-3 md:py-6 z-30 shrink-0 border-b border-white/5 bg-black/60 backdrop-blur-xl">
        <div className="flex flex-col">
          <h1 className="text-lg md:text-3xl font-serif italic glow-text tracking-tight leading-none">Songs from the Gaps</h1>
          <p className="text-[7px] md:text-[10px] uppercase tracking-widest text-white/40 mt-1">Topology sonification engine</p>
        </div>
        
        <div className="flex gap-2 items-center">
          {!coords ? (
            <button onClick={initLocation} className="px-4 py-2 glass hover:bg-white/10 transition-all rounded-full text-[9px] font-bold uppercase tracking-widest text-white/80">
              Anchor
            </button>
          ) : (
            <>
              <button 
                onClick={() => setShowSearch(!showSearch)} 
                className={`flex items-center gap-2 px-3 py-2 rounded-full glass transition-all text-[9px] uppercase tracking-widest font-bold ${showSearch ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <span className="hidden sm:inline">Recentre</span>
              </button>
              <button onClick={() => getNearby(coords.lat, coords.lon, parseInt(searchRadius))} className="w-9 h-9 flex items-center justify-center rounded-full glass hover:bg-white/10 transition-all">
                <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Manual Search Overlay */}
      {showSearch && (
        <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24 px-4">
          <div className="w-full max-w-sm glass rounded-3xl p-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm uppercase tracking-widest font-bold text-white/60">Field Parameters</h3>
              <button onClick={() => setShowSearch(false)} className="text-white/30 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleManualSearch} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-white/30 ml-2">Latitude</label>
                <input 
                  type="text" 
                  value={searchLat} 
                  onChange={(e) => setSearchLat(e.target.value)}
                  placeholder="e.g. 51.5074"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/30 transition-colors font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-white/30 ml-2">Longitude</label>
                <input 
                  type="text" 
                  value={searchLon} 
                  onChange={(e) => setSearchLon(e.target.value)}
                  placeholder="e.g. -0.1278"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/30 transition-colors font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-white/30 ml-2">Radius (m)</label>
                <input 
                  type="number" 
                  value={searchRadius} 
                  onChange={(e) => setSearchRadius(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/30 transition-colors font-mono"
                />
              </div>
              <button 
                type="submit" 
                className="w-full py-4 bg-white text-black font-bold text-[10px] uppercase tracking-[0.2em] rounded-full hover:scale-[1.02] active:scale-[0.98] transition-all mt-4"
              >
                Map Coordinates
              </button>
            </form>
          </div>
        </div>
      )}

      <main className="flex-1 relative flex flex-col md:flex-row gap-0 overflow-hidden">
        <section className="flex-1 relative overflow-hidden">
          {!coords ? (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center z-10">
              <div className="max-w-md space-y-6 animate-float">
                <p className="text-white/60 leading-relaxed font-serif text-lg md:text-2xl italic">Projecting nearby knowledge points into semantic space...</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button onClick={initLocation} className="px-8 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-full">Use Current Location</button>
                  <button onClick={() => setShowSearch(true)} className="px-8 py-3 glass text-white text-[10px] font-bold uppercase tracking-widest rounded-full">Enter Coordinates</button>
                </div>
              </div>
            </div>
          ) : loading ? (
             <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/40 backdrop-blur-sm">
                <div className="text-center space-y-4">
                  <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto"></div>
                  <p className="text-[9px] uppercase tracking-[0.3em] text-white/50 animate-pulse">Relating links...</p>
                </div>
             </div>
          ) : (
            <Visualizer 
              articles={articles} 
              onSelectNode={handleSelectNode}
              origin={origin}
              target={target}
              selectedGapId={session?.gap.id}
            />
          )}
        </section>

        <aside className="w-full md:w-[360px] lg:w-[420px] flex flex-col glass shrink-0 h-[45%] md:h-full z-10 border-t md:border-t-0 md:border-l border-white/10 bg-black/20 backdrop-blur-2xl">
          {session ? (
            <div className="flex flex-col h-full">
              <div className="p-5 md:p-8 flex-1 overflow-y-auto space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-2 md:slide-in-from-right-2 duration-300">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="text-[8px] md:text-[9px] uppercase tracking-widest text-white/30 font-bold">Vector Bridge</div>
                    <h2 className="text-lg md:text-2xl font-serif italic text-white leading-tight">
                      {session.gap.from.title} <span className="text-white/20 font-sans not-italic mx-1">→</span> {session.gap.to.title}
                    </h2>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="h-0.5 flex-1 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-white transition-all duration-700 ease-out" 
                          style={{ width: `${Math.min(100, (session.gap.semanticSimilarity * 500))}%` }}
                        ></div>
                    </div>
                    <span className="text-[8px] font-mono text-white/40">{(session.gap.semanticSimilarity * 100).toFixed(2)}% Affinity</span>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="text-[8px] uppercase tracking-widest text-white/30 font-bold">Structural Intersection</div>
                    <div className="flex flex-wrap gap-1.5">
                      {session.gap.sharedLinks.length > 0 ? (
                        session.gap.sharedLinks.slice(0, 15).map((link, i) => (
                          <span key={i} className="px-2 py-0.5 bg-white/5 rounded text-[8px] text-white/50 border border-white/5 uppercase tracking-tighter whitespace-nowrap">{link}</span>
                        ))
                      ) : (
                        <span className="text-[8px] italic text-white/20">Using latent geometric distance.</span>
                      )}
                      {session.gap.sharedLinks.length > 15 && <span className="text-[8px] text-white/20 self-center">+{session.gap.sharedLinks.length - 15} more</span>}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-[8px] uppercase tracking-widest text-white/30 font-bold">Acoustic Synthesis</div>
                    <div className="space-y-3">
                      {session.voices.map((v, i) => (
                        <div key={i} className="flex gap-3 items-start group">
                          <div className="w-1 h-1 rounded-full bg-white/20 mt-1.5 group-hover:bg-white/60 transition-colors"></div>
                          <div className="flex-1">
                            <span className="text-[8px] uppercase tracking-widest font-bold text-white/30 block mb-0.5">{v.role}</span>
                            <p className="text-[10px] italic text-white/80 leading-relaxed font-serif">{v.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 md:p-8 bg-black/40 border-t border-white/5 backdrop-blur-md space-y-3">
                <div className="flex gap-2">
                  {!session.isPlaying ? (
                    <button onClick={playSong} className="flex-1 py-4 bg-white text-black font-bold text-[10px] uppercase tracking-[0.2em] rounded-full hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-xl shadow-white/5">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      Synthesize Gap
                    </button>
                  ) : (
                    <button onClick={stopSong} className="flex-1 py-4 border border-white/20 text-white font-bold text-[10px] uppercase tracking-[0.2em] rounded-full hover:bg-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
                      Stop Projection
                    </button>
                  )}
                  
                  <button 
                    onClick={handleExport} 
                    disabled={exporting}
                    title="Download as WAV"
                    className="w-14 py-4 flex items-center justify-center glass rounded-full hover:bg-white/10 active:scale-95 transition-all text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {exporting ? (
                       <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    ) : (
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 h-full flex flex-col justify-center text-center space-y-6">
              <div className="relative w-16 h-16 mx-auto opacity-40">
                 <div className="absolute inset-0 border border-white/10 rounded-full animate-ping"></div>
                 <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                 </div>
              </div>
              <div className="space-y-3">
                <p className="text-[9px] text-white/40 uppercase tracking-[0.3em] font-bold">Interactive Manifold</p>
                <p className="text-[11px] text-white/30 max-w-[220px] mx-auto italic leading-relaxed">
                  {coords 
                    ? (!origin ? "Tap a point to define semantic origin." : "Select a second point to establish the knowledge gap.")
                    : "Awaiting anchoring..."}
                </p>
              </div>
              {coords && (
                 <div className="pt-4 opacity-50">
                    <p className="text-[9px] text-white/30 uppercase tracking-widest mb-1">Current Anchor</p>
                    <p className="text-[9px] font-mono text-white/40">{coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}</p>
                 </div>
              )}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
};

export default App;
