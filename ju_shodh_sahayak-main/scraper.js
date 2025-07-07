const FireCrawlApp = require('@mendable/firecrawl-js').default;
const { parse, isValid } = require('date-fns');

// Initialize FireCrawl
const app = new FireCrawlApp({
  apiKey: "fc-22a6d53819e34fcd9fe2ff7ffa58be05"
});

// List of government research funding websites
const researchUrls = [
  'https://dst.gov.in/call-for-proposals',
  'https://www.dbtindia.gov.in/latest-announcement',
  'https://birac.nic.in/cfp.php',
  'https://www.icmr.gov.in/whatnew.html',
  'https://serb.gov.in/page/show/63',
  'https://www.icssr.org/funding',
  'https://www.cefipra.org/ResearchProjects',
  'https://www.igstc.org/',
  'https://tdb.gov.in/',
  'https://www.ugc.ac.in/',
  'https://sparc.iitkgp.ac.in/',
  'https://www.nasi.org.in/awards.htm',
  'https://insaindia.res.in/',
  'https://vit.ac.in/research/call-for-proposals'
];

// Helper: Map agency by URL
const getAgency = (sourceUrl) => {
  if (sourceUrl.includes('dst.gov.in')) return 'DST - Department of Science & Technology';
  if (sourceUrl.includes('dbtindia.gov.in')) return 'DBT - Department of Biotechnology';
  if (sourceUrl.includes('birac.nic.in')) return 'BIRAC - Biotechnology Industry Research Assistance Council';
  if (sourceUrl.includes('icmr.gov.in')) return 'ICMR - Indian Council of Medical Research';
  if (sourceUrl.includes('serb.gov.in')) return 'SERB - Science and Engineering Research Board';
  if (sourceUrl.includes('icssr.org')) return 'ICSSR - Indian Council of Social Science Research';
  if (sourceUrl.includes('cefipra.org')) return 'CEFIPRA - Indo-French Centre for Scientific Research';
  if (sourceUrl.includes('igstc.org')) return 'IGSTC - Indo-German Science & Technology Centre';
  if (sourceUrl.includes('tdb.gov.in')) return 'TDB - Technology Development Board';
  if (sourceUrl.includes('ugc.ac.in')) return 'UGC - University Grants Commission';
  if (sourceUrl.includes('sparc.iitkgp.ac.in')) return 'SPARC - Scheme for Promotion of Academic and Research Collaboration';
  if (sourceUrl.includes('nasi.org.in')) return 'NASI - National Academy of Sciences India';
  if (sourceUrl.includes('insaindia.res.in')) return 'INSA - Indian National Science Academy';
  return 'Unknown Agency';
};

// Enhanced date parsing function
const parseDate = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;

  const cleanDate = dateString.trim().replace(/\s+/g, ' ');
  if (cleanDate.match(/rolling|ongoing|continuous|open|throughout/i)) {
    return 'Rolling Deadline';
  }

  // Common date formats in Indian government websites
  const dateFormats = [
    'dd/MM/yyyy',
    'dd-MM-yyyy',
    'MM/dd/yyyy',
    'yyyy-MM-dd',
    'dd MMM yyyy',
    'dd MMMM yyyy',
    'MMM dd, yyyy',
    'MMMM dd, yyyy',
    'dd/MM/yy',
    'dd-MM-yy'
  ];

  for (const format of dateFormats) {
    try {
      const parsedDate = parse(cleanDate, format, new Date());
      if (isValid(parsedDate)) {
        return parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD
      }
    } catch (_) { continue; }
  }
  return cleanDate; // Return as is if not matched
};

// Extract proposals from markdown content
const extractProposalsFromMarkdown = (markdown, sourceUrl) => {
  const proposals = [];
  const lines = markdown.split('\n');
  let inTable = false, headers = [];

  // Table-based extraction
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('|') && (line.includes('Title') || line.includes('Call') || line.includes('Scheme'))) {
      headers = line.split('|').map(h => h.trim()).filter(h => h);
      inTable = true; continue;
    }
    if (line.match(/^\|[\s\-\|]+\|$/)) continue;

    if (inTable && line.includes('|')) {
      const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
      if (cells.length >= 3) {
        let title = cells[0];
        let link = sourceUrl;
        const linkMatch = title.match(/\[(.+?)\]\((.+?)\)/);
        if (linkMatch) {
          title = linkMatch[1];
          link = linkMatch[2];
          if (link.startsWith('/')) {
            const baseUrl = new URL(sourceUrl).origin;
            link = baseUrl + link;
          }
        }
        const proposal = {
          title,
          agency: getAgency(sourceUrl),
          startDate: parseDate(cells[2]) || 'Not specified',
          endDate: parseDate(cells[3]) || 'Not specified',
          link,
          sourceUrl,
          extractedAt: new Date().toISOString()
        };
        proposals.push(proposal);
      }
    }
    if (inTable && line && !line.includes('|')) inTable = false;
  }

  // Link-based extraction
  const linkRegex = /\[(.+?)\]\((.+?)\)/g;
  let match;
  while ((match = linkRegex.exec(markdown)) !== null) {
    const title = match[1];
    let link = match[2];
    if (title.match(/home|menu|login|about|contact|privacy|terms/i)) continue;
    if (title.length < 10) continue;
    if (link.startsWith('/')) {
      const baseUrl = new URL(sourceUrl).origin;
      link = baseUrl + link;
    }
    if (title.match(/call|proposal|funding|fellowship|grant|award|scheme|program|research|phd|postdoc|scientist|innovation|startup/i)) {
      proposals.push({
        title,
        agency: getAgency(sourceUrl),
        startDate: 'Not specified',
        endDate: 'Not specified',
        link,
        sourceUrl,
        extractedAt: new Date().toISOString()
      });
    }
  }

  // Text-based extraction
  const textLines = markdown.split('\n').map(line => line.trim()).filter(line => line);
  for (const line of textLines) {
    if (line.length < 20 || line.startsWith('#') || line.match(/^[\*\-\+]\s/)) continue;
    if (line.match(/call.*proposal|funding.*available|fellowship.*application|grant.*deadline|research.*opportunity|phd.*position|postdoc.*opening/i)) {
      proposals.push({
        title: line.substring(0, 200),
        agency: getAgency(sourceUrl),
        startDate: 'Not specified',
        endDate: 'Not specified',
        link: sourceUrl,
        sourceUrl,
        extractedAt: new Date().toISOString()
      });
    }
  }
  return proposals;
};

// Main scraping function with logging and faster timeout
const scrapeResearchProposals = async () => {
  const allProposals = [];
  for (const url of researchUrls) {
    try {
      console.log(`\n[INFO] Scraping: ${url}`);
      const scrapeResult = await app.scrapeUrl(url, {
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 15000 // 15 seconds
      });
      if (!scrapeResult.success) {
        console.log(`[WARN] Failed to scrape: ${url}`);
        continue;
      }
      const markdown = scrapeResult.data?.markdown || scrapeResult.markdown;
      if (!markdown) {
        console.log(`[WARN] No content found for: ${url}`);
        continue;
      }
      const proposals = extractProposalsFromMarkdown(markdown, url);
      if (proposals.length > 0) {
        allProposals.push(...proposals);
        console.log(`[INFO] Found ${proposals.length} proposal(s)`);
      } else {
        console.log(`[INFO] No proposals found at: ${url}`);
      }
      // Wait 1s between requests (adjust as needed)
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`[ERROR] Error scraping ${url}:`, error.message);
      continue;
    }
  }

  // De-duplicate (by title, agency, and link)
  const uniqueProposals = allProposals.filter((proposal, index, self) =>
    index === self.findIndex(p =>
      p.title === proposal.title &&
      p.agency === proposal.agency &&
      p.link === proposal.link
    )
  );

  // Sort by end date (active deadlines first)
  uniqueProposals.sort((a, b) => {
    const dateA = new Date(a.endDate);
    const dateB = new Date(b.endDate);
    if (isNaN(dateA) && isNaN(dateB)) return 0;
    if (isNaN(dateA)) return 1;
    if (isNaN(dateB)) return -1;
    return dateA - dateB;
  });

  return uniqueProposals;
};

// Run the scraper
scrapeResearchProposals()
  .then(proposals => {
    console.log("\n[RESULT] Research Funding Proposals:\n");
    console.log(JSON.stringify(proposals, null, 2));
    console.log(`\n[INFO] Total Proposals Found: ${proposals.length}`);
  })
  .catch(error => {
    console.error('[ERROR] Fatal Error:', error);
  });
