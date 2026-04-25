/**
 * Real platform & brand logos fetched from Simple Icons CDN.
 * Returns <img> tags with the exact official brand mark for each service.
 */

interface LogoProps {
  size?: number;
  className?: string;
}

const icon = (slug: string, color?: string) =>
  `https://cdn.simpleicons.org/${slug}${color ? `/${color}` : ""}`;

export function OpenMetadataLogo({ size = 20, className }: LogoProps) {
  return <img src="https://raw.githubusercontent.com/open-metadata/OpenMetadata/main/openmetadata-ui/src/main/resources/ui/public/favicon.png" alt="OpenMetadata" width={size} height={size} className={className} />;
}

export function GitHubLogo({ size = 20, className }: LogoProps) {
  return <img src={icon("github", "white")} alt="GitHub" width={size} height={size} className={className} />;
}

export function SlackLogo({ size = 20, className }: LogoProps) {
  // Inline multi-color Slack mark (rendered directly — no CDN dependency).
  return (
    <svg width={size} height={size} viewBox="0 0 127 127" className={className} aria-label="Slack">
      <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2S.8 87.3.8 80s5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2s13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2S33.8 120.3 33.8 113V80z" fill="#E01E5A"/>
      <path d="M47 27c-7.3 0-13.2-5.9-13.2-13.2S39.7.6 47 .6s13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2s-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9s5.9-13.2 13.2-13.2H47z" fill="#36C5F0"/>
      <path d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2s13.2 5.9 13.2 13.2-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2s-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6s13.2 5.9 13.2 13.2v33.1z" fill="#2EB67D"/>
      <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2s-5.9 13.2-13.2 13.2-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2s5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2s-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E"/>
    </svg>
  );
}

export function GoogleWorkspaceLogo({ size = 20, className }: LogoProps) {
  return <img src={icon("google")} alt="Google Workspace" width={size} height={size} className={className} />;
}

export function JiraLogo({ size = 20, className }: LogoProps) {
  return <img src={icon("jira", "0052CC")} alt="Jira" width={size} height={size} className={className} />;
}

export function NotionLogo({ size = 20, className }: LogoProps) {
  return <img src={icon("notion", "white")} alt="Notion" width={size} height={size} className={className} />;
}

export function EmailLogo({ size = 20, className }: LogoProps) {
  return <img src={icon("gmail", "EA4335")} alt="Email" width={size} height={size} className={className} />;
}

export function GeminiLogo({ size = 20, className }: LogoProps) {
  return <img src={icon("googlegemini", "8E75B2")} alt="Google Gemini" width={size} height={size} className={className} />;
}

export function OpenAILogo({ size = 20, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className || "text-white"}>
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

export function AnthropicLogo({ size = 20, className }: LogoProps) {
  return <img src={icon("anthropic", "D97757")} alt="Anthropic Claude" width={size} height={size} className={className} />;
}

export const PLATFORM_LOGOS: Record<string, React.FC<LogoProps>> = {
  OpenMetadata: OpenMetadataLogo,
  GitHub: GitHubLogo,
  Slack: SlackLogo,
  "Google Workspace": GoogleWorkspaceLogo,
  Jira: JiraLogo,
  Notion: NotionLogo,
  Email: EmailLogo,
};
