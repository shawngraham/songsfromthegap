
import React, { useEffect, useRef } from 'react';
import { WikiArticle } from '../types';

interface VisualizerProps {
  articles: WikiArticle[];
  onSelectNode: (article: WikiArticle) => void;
  origin?: WikiArticle;
  target?: WikiArticle;
  selectedGapId?: string;
}

const Visualizer: React.FC<VisualizerProps> = ({ articles, onSelectNode, origin, target }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(40);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      
      // Dynamic scale based on screen size
      scaleRef.current = Math.min(rect.width, rect.height) / 10;
    };

    window.addEventListener('resize', resize);
    resize();

    let animationId: number;
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const centerX = w / 2;
      const centerY = h / 2;
      ctx.clearRect(0, 0, w, h);

      // Draw potential structural links
      articles.forEach((a, i) => {
        articles.slice(i + 1).forEach(b => {
          const x1 = centerX + a.vector[0] * scaleRef.current;
          const y1 = centerY + a.vector[1] * scaleRef.current;
          const x2 = centerX + b.vector[0] * scaleRef.current;
          const y2 = centerY + b.vector[1] * scaleRef.current;

          const intersection = [...a.links].filter(x => b.links.has(x)).length;
          const union = a.links.size + b.links.size - intersection;
          const similarity = union === 0 ? 0 : intersection / union;

          if (similarity > 0.01) {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineWidth = 0.5 + similarity * 4;
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.03 + similarity * 0.4})`;
            ctx.stroke();
          }
        });
      });

      // Draw Selected Bridge
      if (origin && target) {
        const x1 = centerX + origin.vector[0] * scaleRef.current;
        const y1 = centerY + origin.vector[1] * scaleRef.current;
        const x2 = centerX + target.vector[0] * scaleRef.current;
        const y2 = centerY + target.vector[1] * scaleRef.current;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        const pulse = (Math.sin(Date.now() / 250) + 1) / 2;
        ctx.shadowBlur = 8 + pulse * 12;
        ctx.shadowColor = '#fff';
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Draw Article Nodes
      articles.forEach(article => {
        const x = centerX + article.vector[0] * scaleRef.current;
        const y = centerY + article.vector[1] * scaleRef.current;
        const isOrigin = origin?.pageid === article.pageid;
        const isTarget = target?.pageid === article.pageid;

        // Interactive highlight
        if (isOrigin || isTarget) {
          const aura = ctx.createRadialGradient(x, y, 0, x, y, 25);
          aura.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
          aura.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = aura;
          ctx.beginPath(); ctx.arc(x, y, 25, 0, Math.PI * 2); ctx.fill();
        }

        ctx.fillStyle = (isOrigin || isTarget) ? '#fff' : 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath(); ctx.arc(x, y, (isOrigin || isTarget) ? 4.5 : 2.5, 0, Math.PI * 2); ctx.fill();

        if (isOrigin || isTarget) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
        }

        ctx.font = `${(isOrigin || isTarget) ? '700' : '400'} 9px Space Grotesk`;
        ctx.fillStyle = (isOrigin || isTarget) ? '#fff' : 'rgba(255, 255, 255, 0.3)';
        ctx.textAlign = 'center';
        ctx.fillText(article.title.toUpperCase(), x, y - 14);
        
        if (isOrigin) ctx.fillText('ORIGIN', x, y + 22);
        if (isTarget) ctx.fillText('TARGET', x, y + 22);
      });

      animationId = requestAnimationFrame(render);
    };

    render();

    const handlePointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      let closest: WikiArticle | null = null;
      let minDist = 40; // Larger hit area for mobile/pointer

      articles.forEach(a => {
        const ax = centerX + a.vector[0] * scaleRef.current;
        const ay = centerY + a.vector[1] * scaleRef.current;
        const dist = Math.sqrt((mouseX - ax) ** 2 + (mouseY - ay) ** 2);
        if (dist < minDist) {
          minDist = dist;
          closest = a;
        }
      });

      if (closest) {
        onSelectNode(closest);
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    return () => { 
      cancelAnimationFrame(animationId); 
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', resize);
    };
  }, [articles, origin, target, onSelectNode]);

  return (
    <div className="relative w-full h-full touch-none select-none bg-[#050505]">
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute top-4 left-4 pointer-events-none hidden md:block">
        <div className="text-[8px] uppercase tracking-widest text-white/20 font-bold border-l border-white/10 pl-2">Semantic Topology Mapping</div>
      </div>
    </div>
  );
};

export default Visualizer;
