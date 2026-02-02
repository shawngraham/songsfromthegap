
import { WikiArticle } from '../types';

/**
 * Calculates a semantic position for articles based on their mutual link structure.
 * This is a deterministic implementation of the structural component of Wikipedia2Vec.
 */
export const fetchNearbyArticles = async (lat: number, lon: number, radius: number = 5000): Promise<WikiArticle[]> => {
  const geoUrl = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gsradius=${radius}&gscoord=${lat}|${lon}&gslimit=12&format=json&origin=*`;
  
  try {
    const geoResponse = await fetch(geoUrl);
    const geoData = await geoResponse.json();
    
    if (!geoData.query || !geoData.query.geosearch) return [];

    const articles: WikiArticle[] = geoData.query.geosearch.map((item: any) => ({
      ...item,
      vector: [0, 0],
      links: new Set<string>()
    }));

    // Batch fetch snippets AND links for structural semantic analysis
    const ids = articles.map(a => a.pageid).join('|');
    const detailUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|links&pllimit=500&exintro&explaintext&exsentences=1&pageids=${ids}&format=json&origin=*`;
    
    const detailResponse = await fetch(detailUrl);
    const detailData = await detailResponse.json();

    if (detailData.query && detailData.query.pages) {
      articles.forEach(article => {
        const page = detailData.query.pages[article.pageid];
        if (page) {
          article.snippet = page.extract || article.title;
          if (page.links) {
            page.links.forEach((l: any) => article.links.add(l.title));
          }
        }
      });
    }

    // DIMENSIONAL PROJECTION: Place articles in 2D based on link similarity
    // We use a simple MDS-like approach (Multidimensional Scaling)
    // 1. Calculate similarity matrix
    const similarities = articles.map(a => 
      articles.map(b => {
        if (a === b) return 1;
        const intersection = new Set([...a.links].filter(x => b.links.has(x)));
        const union = new Set([...a.links, ...b.links]);
        return union.size === 0 ? 0 : intersection.size / union.size;
      })
    );

    // 2. Iterative Force Layout (Simplified)
    // Random initial positions
    articles.forEach((a, i) => {
      a.vector = [Math.cos(i) * 3, Math.sin(i) * 3];
    });

    // Run 50 iterations of a force-directed layout based on semantic similarity
    for (let iter = 0; iter < 50; iter++) {
      articles.forEach((a, i) => {
        let fx = 0, fy = 0;
        articles.forEach((b, j) => {
          if (i === j) return;
          const dx = b.vector[0] - a.vector[0];
          const dy = b.vector[1] - a.vector[1];
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
          
          const targetDist = 6 * (1 - similarities[i][j]);
          const force = (dist - targetDist) * 0.1;
          
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        });
        a.vector[0] += fx;
        a.vector[1] += fy;
      });
    }

    return articles;
  } catch (error) {
    console.error("Wikipedia structural search failed:", error);
    return [];
  }
};
