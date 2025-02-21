import fs from 'fs'
try { fs.rmdirSync('./buttons', { recursive: true }) } catch {}
try { fs.rmSync('./db.sqlite') } catch {}
try { fs.rmSync('./cache.json') } catch {}
try { fs.rmSync('./urls.json') } catch {}