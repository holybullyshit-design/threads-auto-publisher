// Recruitment queue is independent of schedule/posts.json and saju credentials.
const PATH = 'schedule/jobs-posts.json';
const api = 'https://api.github.com';
function config() {
  const { GITHUB_TOKEN: token, GITHUB_REPO: repo } = process.env;
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error('채용 GitHub 설정이 없습니다.');
  return { token, repo };
}
async function request(method, path, body) {
  const { token, repo } = config();
  const r = await fetch(`${api}/repos/${repo}/${path}`, { method, headers: {
    Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'
  }, body: body && JSON.stringify(body) });
  return r;
}
async function read() {
  const r = await request('GET', `contents/${PATH}`);
  if (r.status === 404) return { rows: [], sha: null };
  if (!r.ok) throw new Error(`채용 예약 읽기 실패 (HTTP ${r.status})`);
  const data = await r.json();
  let content = data.content;
  if (!content) {
    const b = await request('GET', `git/blobs/${data.sha}`);
    if (!b.ok) throw new Error(`채용 예약 blob 읽기 실패 (HTTP ${b.status})`);
    content = (await b.json()).content;
  }
  const rows = JSON.parse(Buffer.from(content, 'base64').toString('utf8'));
  if (!Array.isArray(rows)) throw new Error('채용 예약 형식 오류');
  return { rows, sha: data.sha };
}
async function secretPresent(name = 'JOB_THREADS_ACCOUNTS_JSON') {
  const r = await request('GET', `actions/secrets/${name}`);
  if (r.status === 404) return false;
  if (!r.ok) throw new Error(`채용 클라우드 시크릿 상태 확인 실패 (HTTP ${r.status})`);
  return true;
}
async function change(mutator, message = 'chore: update recruitment queue [skip ci]') {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { rows, sha } = await read();
    const next = structuredClone(rows);
    const result = mutator(next);
    if (JSON.stringify(next) === JSON.stringify(rows)) return result;
    const r = await request('PUT', `contents/${PATH}`, {
      message, sha: sha || undefined, content: Buffer.from(JSON.stringify(next, null, 2)).toString('base64')
    });
    if (r.ok) return result;
    if (r.status !== 409 && r.status !== 422) throw new Error(`채용 예약 저장 실패 (HTTP ${r.status})`);
  }
  throw new Error('채용 예약 동시 변경으로 중단했습니다.');
}
module.exports = { PATH, read, change, secretPresent };
