import Elysia from 'elysia';
import { html, Html } from '@elysiajs/html'

import Fuse from 'fuse.js'
import type { Button, ButtonDB, Host } from './src/types.js'
import { CustomDB } from './src/custom-db.js';
import { readFileSync } from 'fs'
import path from 'path';
import { Vibrant } from 'node-vibrant/node';

const getDominantColor = async (imagePath) => {
  const palette = await Vibrant.from(imagePath).getPalette()
  return palette.Vibrant!.hsl
}

const port = 3000

let lastDB: ButtonDB | null = null
const loadData = async (): Promise<ButtonDB> => {
  try {
    const db = new CustomDB('./db.sqlite', true);
    lastDB = await db.getAll()
    db.db.close();
  } finally {
    if (lastDB == null) return { hosts: {}, buttons: {} }
    return lastDB
  }
}

const searchHosts = async (db: ButtonDB, q: string) => {
  const fuse = new Fuse(Object.values(db.hosts).flatMap(x => x),{
    includeScore: true,
    isCaseSensitive: false,
    includeMatches: true,
    threshold: 0.3,
    useExtendedSearch: true,
    keys: ['host', 'metadata.title', 'metadata.keywords', 'metadata.description']
  })

  return fuse.search(q)
}

const searchButtons = async (db: ButtonDB, q: string) => {
  const fuse = new Fuse(Object.values(db.buttons).flatMap(x => x),{
    includeScore: true,
    isCaseSensitive: false,
    includeMatches: true,
    threshold: 0.3,
    useExtendedSearch: true,
    keys: ['alts', 'srcs', 'hrefs', 'type']
  })

  return fuse.search(q)
}

const Root = ({ children }) => (
  <html lang="en">
    <head>
      <title>ThinLiquid's Button Database</title>
    </head>
    <body>{children}</body>
    <style>{`
      table {
        max-width: 100%;
        border-collapse: collapse;
      }
      table, td, th {
        border: 1px solid #ccc;
        text-align: left;
        padding: 4px;
      }
      img {
        max-width: 88px;
        max-height: 31px;
      }
      body { word-break: break-word; }
      .pagination {
        margin: 20px 0;
        font-size: 16px;
      }
      .pagination a {
        margin: 0 10px;
        text-decoration: none;
        color: blue;
      }
    `}</style>
  </html>
)

const ButtonSearchForm = ({ value }: {
  value?: string
}) => (
  <form action="/search-buttons" method="get">
    <input type="text" name="q" placeholder="Search for buttons" value={value} />
    <button type="submit">Search</button>
  </form>
)

const HostSearchForm = ({ value }: {
  value?: string
}) => (
  <form action="/search-hosts" method="get">
    <input type="text" name="q" placeholder="Search for hosts" value={value} />
    <button type="submit">Search</button>
  </form>
)

const ImageButton = ({ href, src, alt }: {
  href?: string
  src: string
  alt?: string
}) => (
  <a href={href || '#'}>
    <img src={src} alt={alt} width="88" height="31" />
  </a>
)

const HostSearchResult = ({ item, score, db }: {
  item: Host,
  score: number
  db: ButtonDB
}) => (
  <div>
    <h3>{item.host} (score: {score})</h3>
    <details>
      <summary>site metadata</summary>
      <p>
        {item.metadata.map(x => (
          <>
            <strong>{x.title}</strong>
            <br/>
            {x.description ?? 'no description'}
            <br/>
            {x.keywords ? x.keywords.join(', ') : ''}
            <br/>
          </>
        ))}
      </p>
    </details>
    <details>
      <summary>paths</summary>
      <ul>
        {item.paths.map(x => <li>{x.join(' > ')}</li>)}
      </ul>
    </details>
    <details>
      <summary>buttons</summary>

      <table>
        <thead>
          <tr>
            <th>hash</th>
            <th>button</th>
            <th>alt</th>
            <th>src</th>
            <th>href</th>
            <th>found at</th>
            <th>timestamp</th>
          </tr>
        </thead>
        <tbody>
          {item.buttons.map((hash) => {
            const button = db.buttons[hash]

            return (
              <tr>
                <td>{hash}</td>
                <td><ImageButton src={button.srcs[0]} href={button.hrefs[0]} alt={button.alts[0]} /></td>
                <td style={`background:${button.alts[0] || '' ? 'transparent' : 'lightgrey'}`}>{button.alts[0] || ''}</td>
                <td>{button.srcs.join('<br/>')}</td>
                <td style={`background:${button.hrefs[0] || '' ? 'transparent' : 'lightgrey'}`}>{button.hrefs[0] || ''}</td>
                <td>{button.foundAt.join('<br/>')}</td>
                <td>{new Date(button.timestamp).toUTCString()}</td>
              </tr>
            )
          }).join('')}
        </tbody>
      </table>
    </details>
    <hr/>
  </div>
)

const ButtonSearchResult = ({ item, score }: {
  item: Button
  score: number
}) => (
  <div>
    <ImageButton href={item.hrefs[0]} src={item.srcs[0]} alt={item.alts[0]} />
    <h3>{item.alts[0] ?? `${item.hrefs[0]} button`} (score: {score})</h3>
    <p>Found on {new Date(item.timestamp).toUTCString()}</p>

    <details>
      <summary>alts</summary>
      {item.alts.map(x => `${x}<br/>`)}
    </details>
    <details>
      <summary>srcs</summary>
      {item.srcs.map(x => `${x}<br/>`)}
    </details>
    <details>
      <summary>hrefs</summary>
      {item.hrefs.map(x => `${x}<br/>`)}
    </details>
    <hr/>
  </div>
)

const Pagination = ({ page, totalPages, pageSize, q }: {
  page: number
  pageSize: number
  totalPages: number
  q: string
}) => (
  <div class="pagination">
    {page > 1 && <a href={`./search-hosts?q=${encodeURIComponent(q)}&page=${page - 1}&pageSize=${pageSize}`}>Previous</a>}
    &nbsp;<span>Page {page} of {totalPages}</span>&nbsp;
    {page < totalPages && <a href={`./search-hosts?q=${encodeURIComponent(q)}&page=${page + 1}&pageSize=${pageSize}`}>Next</a>}
  </div>
)

const app = new Elysia()
  .use(html()) 
  .get('/', async () => {
    const db = await loadData()

    const hosts = Object.values(db.hosts).length
    const buttons = Object.values(db.buttons).length

    return (
      <Root>
        <h1>88x31 Button Search</h1>
        
        <ButtonSearchForm />
        <HostSearchForm />
        
        <p>
          <b>{hosts}</b> hosts<br/>
          <b>{buttons}</b> buttons
        </p>
        <p>
          <a href="./all">View all 88x31 buttons</a><br/>
          <a href="./spectrum">View button spectrum</a>
        </p>
      </Root>
    )
  })
  .get('/buttons/:button', ({ params }) => Bun.file(path.normalize(`buttons/${params.button}`)))
  .get('/spectrum', async () => {
    const db = await loadData();
    const buttons = (await Promise.all(
      Object.entries(db.buttons).map(async ([hash, button]) => {
        const color = await getDominantColor(`buttons/${hash}.${button.type ?? 'png'}`).catch(() => null);
        return color ? { hash, button, color } : null;
      })
    )).filter(x => x != null);
    
    buttons.sort((a, b) => {
      const [ar, ag, ab] = a!.color;
      const [br, bg, bb] = b!.color;
      return ar - br || ag - bg || ab - bb;
    });
  
    return (
      <Root>
        <a href="./">Back</a>
        <h1>Button Spectrum</h1>
        {buttons.map(({ hash, button }) => <ImageButton href={button.hrefs[0]} src={`/buttons/${hash}.${button.type ?? 'png'}`} alt={button.alts[0]} />)}
      </Root>
    );
  })
  .get('/all', async () => {
    const db = await loadData();
    const buttons = Object.entries(db.buttons)

    return (
      <Root>
        <a href="./">Back</a>
        <h1>All Buttons ({buttons.length})</h1>
        {buttons.map(([ hash, button ]) => <ImageButton href={button.hrefs[0]} src={`/buttons/${hash}.${button.type ?? 'png'}`} alt={button.alts[0]} />)}
      </Root>
    );
  })
  .get('/search-hosts', async ({ query }) => {
    const db = await loadData()

    const q = query.q || '';
    const page = parseInt(query.page) || 1;
    const pageSize = parseInt(query.pageSize) || 10;

    const start = Date.now();
    const results = await searchHosts(db, q);
    const end = Date.now();

    const totalResults = results.length;
    const totalPages = Math.ceil(totalResults / pageSize);
    const offset = (page - 1) * pageSize;
    const paginatedResults = results.slice(offset, offset + pageSize);

    const renderedResults = paginatedResults.map(({ item, score }) => <HostSearchResult item={item} score={score} db={db} />);
    const pagination = <Pagination q={q} totalPages={totalPages} page={page} pageSize={pageSize}/>

    return (
      <Root>
        <a href="./">Back</a>
        <h1>88x31 Button Search</h1>
        <HostSearchForm value={q} />
        <p>Extended search syntax: <a href="https://www.fusejs.io/examples.html#extended-search">https://www.fusejs.io/examples.html#extended-search</a></p>

        <h2>Search results for: {q}</h2>
        <p>Found {totalResults} results in {end - start}ms, total {Object.values(db.hosts).length}</p>
        {pagination}
        <div>
          {renderedResults}
        </div>
      </Root>
    )
  })
  .get('/search-buttons', async ({ query }) => {
    const db = await loadData()

    const q = query.q || '';
    const page = parseInt(query.page) || 1;
    const pageSize = parseInt(query.pageSize) || 10;

    const start = Date.now();
    const results = await searchButtons(db, q);
    const end = Date.now();

    const totalResults = results.length;
    const totalPages = Math.ceil(totalResults / pageSize);
    const offset = (page - 1) * pageSize;
    const paginatedResults = results.slice(offset, offset + pageSize);

    const renderedResults = paginatedResults.map(({ item, score }) => <ButtonSearchResult item={item} score={score} />);
    const pagination = <Pagination q={q} totalPages={totalPages} page={page} pageSize={pageSize}/>

    return (
      <Root>
        <a href="./">Back</a>
        <h1>88x31 Button Search</h1>
        <ButtonSearchForm value={q} />
        <p>Extended search syntax: <a href="https://www.fusejs.io/examples.html#extended-search">https://www.fusejs.io/examples.html#extended-search</a></p>

        <h2>Search results for: {q}</h2>
        <p>Found {totalResults} results in {end - start}ms, total {Object.values(db.hosts).length}</p>
        {pagination}
        <div>
          {renderedResults}
        </div>
      </Root>
    );
  })
  .get('/raw', async () => {
    return await loadData()
  })

app.listen({
  port,
}, () => {
  console.log(`Server started at http://localhost:${port}`)
})