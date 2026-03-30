import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '문서 - AresDevUnit Hub',
  description: '시작 가이드, skill.json 스펙, CLI 명령어',
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          문서
        </h1>
        <p className="mb-8 text-zinc-600 dark:text-zinc-400">
          AresDevUnit Hub를 시작하는 데 필요한 모든 것.
        </p>

        {/* Table of Contents */}
        <nav className="mb-10 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            목차
          </h2>
          <ul className="space-y-1 text-sm">
            <TocLink href="#getting-started">시작하기</TocLink>
            <TocLink href="#skill-json-spec">skill.json 스펙</TocLink>
            <TocLink href="#cli-commands">CLI 명령어</TocLink>
            <TocLink href="#agent-integration">Agent 연동</TocLink>
            <TocLink href="#faq">자주 묻는 질문</TocLink>
          </ul>
        </nav>

        <div className="space-y-12">
          {/* Getting Started */}
          <Section id="getting-started" title="시작하기">
            <Step number={1} title="CLI 설치">
              <p>원라인 설치:</p>
              <CodeBlock>curl -fsSL https://aresdevunit.vercel.app/api/v1/install.sh | bash</CodeBlock>
              <p>또는 수동 설치:</p>
              <CodeBlock>{`git clone https://github.com/aresdev-unit/aresdevunit.git
cd aresdevunit/packages/cli
npm install && npm run build && npm link`}</CodeBlock>
              <p>설치 확인:</p>
              <CodeBlock>aresdevhubcli --version</CodeBlock>
            </Step>

            <Step number={2} title="인증">
              <p>GitHub 계정으로 로그인하세요:</p>
              <CodeBlock>aresdevhubcli login</CodeBlock>
              <p>
                브라우저에서 GitHub OAuth 인증이 열립니다.
                완료되면 토큰이 로컬에 저장됩니다.
              </p>
            </Step>

            <Step number={3} title="Workspace 설정">
              <p>데이터 테이블 작업 시 workspace 경로를 설정하세요 (최초 1회):</p>
              <CodeBlock>{`aresdevhubcli config set workspace_path "0_데이터 테이블/TRUNK_GL경로"
# 이후 skill/rule 설치 시 {workspace_path}/.skills/ 에 자동 저장`}</CodeBlock>
            </Step>

            <Step number={4} title="Skill 생성">
              <p>새 Skill 프로젝트를 초기화하세요:</p>
              <CodeBlock>{`# 대화형 모드
aresdevhubcli init

# 비대화형 (Agent용)
aresdevhubcli init --name my-skill --description "Automates X" --category developer-tools --agent-types claude`}</CodeBlock>
              <p>
                <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs font-mono dark:bg-zinc-800">skill.json</code>과
                템플릿 <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs font-mono dark:bg-zinc-800">.md</code> 파일이 생성됩니다.
                <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs font-mono dark:bg-zinc-800">.md</code> 파일에 Skill 내용을 작성하세요.
              </p>
            </Step>

            <Step number={5} title="배포">
              <p>Skill을 검증하고 배포하세요:</p>
              <CodeBlock>{`aresdevhubcli validate   # Check before publish
aresdevhubcli publish    # Publish to registry`}</CodeBlock>
            </Step>

            <Step number={6} title="Skill 설치">
              <p>다른 사람이 만든 Skill을 탐색하고 설치하세요:</p>
              <CodeBlock>{`aresdevhubcli search "code review"
aresdevhubcli install code-review-helper --agent claude`}</CodeBlock>
            </Step>
          </Section>

          {/* skill.json Spec */}
          <Section id="skill-json-spec" title="skill.json 스펙">
            <CodeBlock>{`{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "Short description (10-200 chars)",
  "author": "your-github-username",
  "category": "developer-tools",
  "agent_types": ["claude"],
  "keywords": ["git", "automation"],
  "license": "MIT",
  "files": {
    "claude": "my-skill.md"
  }
}`}</CodeBlock>

            <div className="mt-6 space-y-4">
              <FieldTable
                title="필수 필드"
                fields={[
                  { name: 'name', desc: '2-50 chars, lowercase, a-z0-9 and hyphens only' },
                  { name: 'version', desc: 'Semantic versioning (e.g., 1.0.0)' },
                  { name: 'description', desc: '10-200 characters' },
                  { name: 'author', desc: 'Your GitHub username' },
                  { name: 'category', desc: 'One of the valid categories (see below)' },
                  { name: 'agent_types', desc: 'Array with at least one: claude, codex' },
                  { name: 'files', desc: 'Map of agent type to .md file path' },
                ]}
              />

              <FieldTable
                title="선택 필드"
                fields={[
                  { name: 'keywords', desc: 'Up to 10 keywords, max 30 chars each' },
                  { name: 'license', desc: 'Default: MIT' },
                  { name: 'min_agent_versions', desc: 'Minimum agent version requirements' },
                ]}
              />

              <div>
                <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  유효한 카테고리
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[
                    'developer-tools',
                    'code-review',
                    'documentation',
                    'testing',
                    'devops',
                    'data-analysis',
                    'writing',
                    'productivity',
                    'other',
                  ].map((cat) => (
                    <span
                      key={cat}
                      className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  파일 제한
                </h4>
                <ul className="list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                  <li>파일당 최대 500KB</li>
                  <li>전체 파일 합계 최대 1MB</li>
                  <li>.md 파일만 허용</li>
                  <li>Skill당 최대 5개 파일</li>
                </ul>
              </div>
            </div>
          </Section>

          {/* CLI Commands */}
          <Section id="cli-commands" title="CLI 명령어">
            <div className="space-y-1">
              <CommandRow cmd="aresdevhubcli login" desc="GitHub OAuth 인증" />
              <CommandRow cmd="aresdevhubcli logout" desc="로그아웃 및 토큰 해제" />
              <CommandRow cmd="aresdevhubcli whoami" desc="현재 사용자 정보 표시" />
              <CommandRow cmd="aresdevhubcli init" desc="새 Skill 프로젝트 생성" />
              <CommandRow cmd="aresdevhubcli validate" desc="배포 전 Skill 검증" />
              <CommandRow cmd="aresdevhubcli publish" desc="레지스트리에 Skill 배포" />
              <CommandRow cmd="aresdevhubcli install <name>" desc="Skill 설치" />
              <CommandRow cmd="aresdevhubcli uninstall <name>" desc="설치된 Skill 제거" />
              <CommandRow cmd="aresdevhubcli update [name]" desc="설치된 Skill 업데이트" />
              <CommandRow cmd="aresdevhubcli search <query>" desc="Skill 레지스트리 검색" />
              <CommandRow cmd="aresdevhubcli info <name>" desc="Skill 상세 정보 표시" />
              <CommandRow cmd="aresdevhubcli list" desc="설치/배포된 Skill 목록" />
              <CommandRow cmd="aresdevhubcli rules list" desc="설치된 규칙 목록" />
              <CommandRow cmd="aresdevhubcli rules path" desc="규칙 디렉토리 경로" />
              <CommandRow cmd="aresdevhubcli rules show &lt;name&gt;" desc="규칙 내용 보기" />
            </div>

            <div className="mt-6">
              <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                전역 플래그
              </h4>
              <div className="space-y-1">
                <CommandRow cmd="--json" desc="JSON 형식 출력" />
                <CommandRow cmd="--yes / -y" desc="모든 프롬프트 자동 승인" />
                <CommandRow cmd="--no-color" desc="색상 및 기호 비활성화" />
                <CommandRow cmd="--agent <type>" desc="Agent 유형 지정 (claude, codex)" />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
              <strong>Agent 친화적 패턴:</strong>
              <code className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-mono dark:bg-blue-900">
                aresdevhubcli install &lt;name&gt; --yes --json --agent claude
              </code>
            </div>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                종료 코드
              </h4>
              <div className="space-y-1">
                <CommandRow cmd="0" desc="성공" />
                <CommandRow cmd="1" desc="일반 오류" />
                <CommandRow cmd="2" desc="검증 오류" />
                <CommandRow cmd="3" desc="인증 오류" />
                <CommandRow cmd="4" desc="네트워크 오류" />
                <CommandRow cmd="5" desc="Skill을 찾을 수 없음" />
              </div>
            </div>
          </Section>

          {/* Agent Integration */}
          <Section id="agent-integration" title="Agent 연동">
            <p>
              Skill은 Agent의 명령어 디렉토리에 <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs font-mono dark:bg-zinc-800">.md</code> 파일로
              설치됩니다. 설치 후 Agent가 슬래시 명령어로 사용할 수 있습니다.
            </p>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                설치 위치
              </h4>
              <div className="space-y-1">
                <CommandRow cmd="Claude Code" desc="~/.claude/commands/<name>.md" />
                <CommandRow cmd="Codex" desc="aresdevhubcli config로 설정 가능" />
              </div>
            </div>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Agent 감지 우선순위
              </h4>
              <ol className="list-inside list-decimal space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                <li><code className="rounded bg-zinc-100 px-1 text-xs font-mono dark:bg-zinc-800">--agent</code> 플래그 (최우선)</li>
                <li><code className="rounded bg-zinc-100 px-1 text-xs font-mono dark:bg-zinc-800">~/.aresdevunit/config.json</code> 기본 Agent</li>
                <li>자동 감지 (<code className="rounded bg-zinc-100 px-1 text-xs font-mono dark:bg-zinc-800">~/.claude/</code> 존재 시 = claude)</li>
                <li>대화형 프롬프트 (비TTY에서는 오류)</li>
              </ol>
            </div>
          </Section>

          {/* FAQ */}
          <Section id="faq" title="자주 묻는 질문">
            <div className="space-y-6">
              <FAQ
                q="배포된 버전을 수정할 수 있나요?"
                a="아니요. 배포된 버전은 변경 불가합니다. 버그를 수정하려면 aresdevhubcli publish --patch로 새 버전을 배포하세요 (예: 1.0.0 -> 1.0.1)."
              />
              <FAQ
                q="Skill을 설치하려면 계정이 필요한가요?"
                a="아니요. Skill 탐색 및 설치는 인증 없이 가능합니다. 배포 또는 좋아요를 하려면 로그인이 필요합니다."
              />
              <FAQ
                q="어떤 파일 형식을 지원하나요?"
                a=".md (Markdown) 파일만 허용됩니다. Skill당 최대 5개 파일, 파일당 500KB, 전체 1MB 제한입니다."
              />
              <FAQ
                q="Skill을 지원 중단하려면 어떻게 하나요?"
                a="CLI에서 aresdevhubcli deprecate <name>을 사용하세요. 또는 관리자에게 관리자 패널에서 지원 중단을 요청하세요."
              />
              <FAQ
                q="전체 API 문서는 어디에 있나요?"
                a="CLI 가이드에 모든 API 엔드포인트가 포함되어 있습니다. GET /api/v1/cli-guide로 접근하거나 aresdevhubcli --help로 명령어별 도움말을 확인하세요."
              />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* -- Helper Components -- */

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-4 text-xl font-bold text-zinc-900 dark:text-zinc-50">
        {title}
      </h2>
      <div className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300">
        {children}
      </div>
    </section>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
          {number}
        </span>
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      </div>
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs font-mono text-zinc-100 dark:bg-zinc-800">
      <code>{children}</code>
    </pre>
  );
}

function CommandRow({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-zinc-50 px-4 py-2.5 dark:bg-zinc-800/50">
      <code className="text-sm font-mono font-medium text-zinc-800 dark:text-zinc-200">
        {cmd}
      </code>
      <span className="ml-4 text-xs text-zinc-500 dark:text-zinc-400">{desc}</span>
    </div>
  );
}

function FieldTable({
  title,
  fields,
}: {
  title: string;
  fields: { name: string; desc: string }[];
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h4>
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {fields.map((f) => (
              <tr key={f.name}>
                <td className="w-40 bg-zinc-50 px-4 py-2 font-mono text-xs font-medium text-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-200">
                  {f.name}
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{f.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">{q}</h4>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">{a}</p>
    </div>
  );
}

function TocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a
        href={href}
        className="text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        {children}
      </a>
    </li>
  );
}
