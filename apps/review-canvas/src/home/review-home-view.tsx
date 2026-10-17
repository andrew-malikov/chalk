import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { Input } from "@canvas/components/ui/input";
import { CanvasUiContext, useCanvasMenu } from "@canvas/host/canvas-ui";
import { cn } from "@canvas/lib/utils";
import { ArchiveIcon } from "@canvas/review/review-corner-action";
import { Button, IconButton } from "@canvas/ui/button";
import { EmptyState } from "@canvas/ui/empty-state";
import { OptionMenu } from "@canvas/ui/option-menu";
import { textStyles } from "@canvas/ui/text";
import type {
  ReviewApiSummary,
  ReviewCanvasInstallContent,
  ReviewCanvasOnboarding,
  ReviewCanvasSetupActions,
} from "@chalk/review-contracts";
import { fuzzyMatches, fuzzySegments } from "@review/lib/fuzzy-match";
import {
  ArrowDownUp,
  Ellipsis,
  ListFilter,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { homeStyles } from "./home-styles";
import { WelcomePage } from "./welcome-page";

interface ReviewHomeProps {
  reviews: readonly ReviewApiSummary[];
  onOpen(review: ReviewApiSummary): void;
  // Deletion requires host confirmation.
  // Absent when the host does not support deletion.
  onDelete?(review: ReviewApiSummary): Promise<void>;
  // Dismissal is reversible. Absent when the host does not
  // support them.
  onDismiss?(review: ReviewApiSummary): Promise<void>;
  onRestore?(review: ReviewApiSummary): Promise<void>;
  // Present only while the list is empty: Home then renders Welcome.
  install?: ReviewCanvasInstallContent;
  setupActions?: ReviewCanvasSetupActions;
  onboarding?: ReviewCanvasOnboarding;
  onOpenTutorial?(): void;
}

interface ReviewAttentionActions {
  onDelete?(review: ReviewApiSummary): Promise<void>;
  onDismiss?(review: ReviewApiSummary): Promise<void>;
  onRestore?(review: ReviewApiSummary): Promise<void>;
}

/* Passed by context rather than through every list and card signature: the
   actions are optional and only leaf controls use them. */
const AttentionActionsContext = createContext<ReviewAttentionActions>({});

/* The search query reaches the leaves the same way, and for the same reason:
   every title and worktree label marks its own hit, and threading a prop
   through the card tree and a table column would touch far more code. */
const SearchQueryContext = createContext("");

/** A label with the characters the query hit marked. */
function MatchedText({ text }: { text: string }) {
  const query = useContext(SearchQueryContext);
  const segments = fuzzySegments(query, text);

  // One segment can also mean the query matched the whole label, so check that
  // it is the unmatched one before skipping the marks.
  if (segments.length === 1 && !segments[0].matched) return <>{text}</>;

  return (
    <>
      {segments.map((segment, index) =>
        segment.matched ? (
          // Segments are positional, so the index is the only stable key.
          // eslint-disable-next-line react/no-array-index-key
          <mark key={index} className={styles.mark}>
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

export function ReviewHome({
  reviews,
  onOpen,
  onDelete,
  onDismiss,
  onRestore,
  install,
  setupActions,
  onboarding,
  onOpenTutorial,
}: ReviewHomeProps) {
  const ui = useContext(CanvasUiContext);
  const deleting = useRef(new Set<string>());
  const [showDismissed, setShowDismissed] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [query, setQuery] = useState("");
  const [, setNow] = useState(Date.now);

  const [deletions, setDeletions] = useState(
    new Map<string, "pending" | "deleted">(),
  );

  const [deleteError, setDeleteError] = useState<string>();

  // Keep successful deletions hidden until the catalog acknowledges removal.
  useEffect(() => {
    setDeletions((current) => {
      const next = new Map(current);

      for (const [id, status] of current) {
        if (
          status === "deleted" &&
          !reviews.some((review) => review.reviewId === id)
        ) {
          next.delete(id);
        }
      }

      return next.size === current.size ? current : next;
    });
  }, [reviews, deletions]);

  const deleteReview = useCallback(
    async (review: ReviewApiSummary) => {
      if (
        !onDelete ||
        !ui?.confirmDelete ||
        deleting.current.has(review.reviewId)
      )
        return;
      deleting.current.add(review.reviewId);
      setDeleteError(undefined);

      try {
        if (!(await ui.confirmDelete(reviewTitle(review)))) return;
        setDeletions((current) =>
          new Map(current).set(review.reviewId, "pending"),
        );
        await onDelete(review);
        setDeletions((current) =>
          new Map(current).set(review.reviewId, "deleted"),
        );
      } catch {
        setDeletions((current) => {
          const next = new Map(current);
          next.delete(review.reviewId);

          return next;
        });
        setDeleteError(
          `Could not delete “${reviewTitle(review)}”. Please try again.`,
        );
      } finally {
        deleting.current.delete(review.reviewId);
      }
    },
    [onDelete, ui],
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);

    return () => clearInterval(timer);
  }, []);

  const actions = useMemo(
    () => ({
      onDismiss,
      onRestore,
      onDelete: onDelete ? deleteReview : undefined,
    }),
    [onDismiss, onRestore, onDelete, deleteReview],
  );

  const needle = query.trim();

  // The one scratchpad is the last group on Home, outside the workspaces,
  // their chronological order and their lifecycle. The filter still finds it.
  const scratchpad = reviews.find((review) => review.kind === "scratchpad");

  const listed = useMemo(
    () => reviews.filter((review) => review.kind !== "scratchpad"),
    [reviews],
  );

  const scratchpadShown =
    scratchpad !== undefined && matchesQuery(scratchpad, needle);

  const found = useMemo(
    () =>
      listed.filter(
        (review) =>
          !deletions.has(review.reviewId) && matchesQuery(review, needle),
      ),
    [listed, needle, deletions],
  );

  /* Dismissed leaves the main list entirely: it is the one group you asked to
     stop seeing. */
  const active = found.filter((review) => !review.dismissedAt);

  const dismissed = found
    .filter((review) => review.dismissedAt)
    .sort(latestFirst);

  /* With nothing to list, Home is the Welcome rail rather than a zero state
     of its own: the same three steps, in the place the reader already is.
 */
  if (
    !onboardingDismissed &&
    listed.length === 0 &&
    deletions.size === 0 &&
    !deleteError
  ) {
    return (
      <WelcomePage
        onDismissUpdate={() => setOnboardingDismissed(true)}
        install={install}
        setupActions={setupActions}
        onboarding={onboarding}
        onOpenTutorial={onOpenTutorial}
      />
    );
  }

  return (
    <main className={cn("review-home", homeStyles.page)}>
      <div className={homeStyles.scroll}>
        <div className={homeStyles.content}>
          <div className={homeStyles.header}>
            <h1 className={homeStyles.heading}>Sessions</h1>
            <div className={styles.headerTools}>
              <SearchBox query={query} onChange={setQuery} />
            </div>
          </div>
          {deleteError ? <p role="alert">{deleteError}</p> : null}
          {/* Keyed off the active list, not the whole result: a query that hits
              only dismissed reviews empties the main area, and the collapsed
              Dismissed count alone does not explain why. */}
          {needle && active.length === 0 && !scratchpadShown ? (
            <EmptyState
              message={
                dismissed.length > 0
                  ? `No active reviews match “${needle}”. Look in Settled below.`
                  : `No reviews match “${needle}”.`
              }
            />
          ) : null}
          <SearchQueryContext.Provider value={needle}>
            <AttentionActionsContext.Provider value={actions}>
              {scratchpadShown ? (
                <ScratchpadGroup review={scratchpad} onOpen={onOpen} />
              ) : null}
              {active.length > 0 ? (
                <ReviewTable reviews={active} onOpen={onOpen} />
              ) : null}
              {dismissed.length > 0 ? (
                <DismissedSection
                  reviews={dismissed}
                  expanded={showDismissed}
                  onToggle={() => setShowDismissed((open) => !open)}
                  onOpen={onOpen}
                  onDelete={actions.onDelete}
                />
              ) : null}
            </AttentionActionsContext.Provider>
          </SearchQueryContext.Provider>
        </div>
      </div>
    </main>
  );
}

/**
 * Filter-as-you-type over the review title and the worktree name — the two
 * labels the page already shows. Escape clears it.
 */
function SearchBox({
  query,
  onChange,
}: {
  query: string;
  onChange(query: string): void;
}) {
  const input = useRef<HTMLInputElement>(null);

  // ⌘F (Ctrl+F off the Mac) jumps to the filter instead of the browser's
  // find bar. Ctrl+F stays forward-char on the Mac.
  useEffect(() => {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);

    const keydown = (event: KeyboardEvent) => {
      if (
        (mac ? event.metaKey : event.ctrlKey) &&
        !(mac ? event.ctrlKey : event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };

    window.addEventListener("keydown", keydown);

    return () => window.removeEventListener("keydown", keydown);
  }, []);

  return (
    <div className={styles.search}>
      <SearchIcon />
      <Input
        ref={input}
        className={cn(
          "tw:h-auto tw:border-0 tw:p-0 tw:shadow-none tw:focus-visible:ring-0",
          styles.searchInput,
        )}
        type="search"
        value={query}
        placeholder="Search sessions"
        aria-label="Search sessions"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && query) {
            event.stopPropagation();
            onChange("");
          }
        }}
      />
      {query ? (
        <ButtonPrimitive
          variant="ghost"
          size="xs"
          type="button"
          className={cn(
            "tw:h-auto tw:whitespace-normal tw:font-normal",
            styles.searchClear,
          )}
          aria-label="Clear search"
          // Clearing unmounts this button, so hand focus back to the field
          // rather than letting it fall to the body.
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <ClearIcon />
        </ButtonPrimitive>
      ) : null}
    </div>
  );
}

/**
 * Dismissed reviews, collapsed by default and kept out of the workspace
 * grouping. Sessions stay saved until the reader deletes them.
 */
function DismissedSection({
  reviews,
  expanded,
  onToggle,
  onOpen,
  onDelete,
}: {
  reviews: readonly ReviewApiSummary[];
  expanded: boolean;
  onToggle(): void;
  onOpen(review: ReviewApiSummary): void;
  onDelete?(review: ReviewApiSummary): Promise<void>;
}) {
  return (
    <section className={styles.dismissed} aria-label="Settled sessions">
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        type="button"
        className={cn(
          "tw:h-auto tw:whitespace-normal tw:font-normal",
          textStyles.eyebrow,
          styles.dismissedToggle,
        )}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span>Settled</span>
        <span className={styles.dismissedCount}>{reviews.length}</span>
      </ButtonPrimitive>
      {expanded ? (
        <div className={styles.dismissedRows}>
          {reviews.map((review) => (
            <div key={review.reviewId} className={styles.dismissedRow}>
              <ButtonPrimitive
                variant="ghost"
                size="xs"
                type="button"
                className={cn(
                  "tw:h-auto tw:whitespace-normal tw:font-normal",
                  styles.dismissedOpen,
                )}
                onClick={() => onOpen(review)}
              >
                <MatchedText text={reviewTitle(review)} />
              </ButtonPrimitive>
              <span className={styles.dismissedClock}>kept</span>
              <RestoreReviewButton review={review} />
              {onDelete ? (
                <DeleteReviewButton review={review} onDelete={onDelete} />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Undo clears the dismissal stamp. */
function RestoreReviewButton({ review }: { review: ReviewApiSummary }) {
  const { onRestore } = useContext(AttentionActionsContext);
  const [busy, setBusy] = useState(false);

  if (!onRestore) return null;

  return (
    <Button
      className={styles.restore}
      loading={busy}
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation();
        setBusy(true);
        void onRestore(review)
          .catch(() => undefined)
          .finally(() => setBusy(false));
      }}
    >
      Undo
    </Button>
  );
}

type ReviewSort = "newest" | "oldest" | "updated" | "title";

function ReviewTable({
  reviews,
  onOpen,
}: {
  reviews: readonly ReviewApiSummary[];
  onOpen(review: ReviewApiSummary): void;
}) {
  const [repository, setRepository] = useState("");
  const [sort, setSort] = useState<ReviewSort>("newest");
  const repositories = [...new Set(reviews.map(repositoryLabel))].sort();

  const filtered = reviews.filter(
    (review) => !repository || repositoryLabel(review) === repository,
  );

  const sorted = [...filtered].sort((left, right) => {
    const created = (review: ReviewApiSummary) =>
      Date.parse(review.firstCreatedAt ?? review.createdAt) || 0;

    switch (sort) {
      case "oldest":
        return created(left) - created(right);
      case "updated":
        return latestFirst(left, right);
      case "title":
        return reviewTitle(left).localeCompare(reviewTitle(right));
      default:
        return created(right) - created(left);
    }
  });

  return (
    <section className={styles.tableSection} aria-label="Sessions">
      <div className={styles.toolbar}>
        <span>{countLabel(filtered.length, "review")}</span>
        <div className={styles.controls}>
          <TableMenu
            label="Filter"
            ariaLabel="Filter by repository"
            value={repository}
            options={[
              { value: "", label: "All repos" },
              ...repositories.map((name) => ({ value: name, label: name })),
            ]}
            onChange={setRepository}
          />
          <TableMenu<ReviewSort>
            label="Sort"
            ariaLabel="Sort reviews"
            value={sort}
            options={[
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "updated", label: "Recently updated" },
              { value: "title", label: "Title A–Z" },
            ]}
            onChange={setSort}
          />
        </div>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <colgroup>
            <col />
            <col className={styles.colBranch} />
            <col className={styles.colDate} />
            <col className={styles.colDate} />
            <col className={styles.colAction} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={cn(styles.th, styles.firstCell)}>
                Title
              </th>
              <th scope="col" className={styles.th}>
                Head branch
              </th>
              <th scope="col" className={styles.th}>
                Created
              </th>
              <th scope="col" className={styles.th}>
                Updated
              </th>
              <th scope="col" className={styles.th}>
                <span className={styles.visuallyHidden}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((review, index) => {
              const last = index === sorted.length - 1;

              return (
                <tr
                  key={review.reviewId}
                  className={cn("canvas-row", styles.row)}
                  onClick={() => onOpen(review)}
                >
                  <td
                    aria-label={reviewTitle(review)}
                    className={cn(
                      styles.td,
                      styles.firstCell,
                      last && styles.lastRowCell,
                    )}
                  >
                    <ButtonPrimitive
                      variant="ghost"
                      size="xs"
                      className={cn(
                        "tw:h-auto tw:whitespace-normal tw:font-normal",
                        styles.tableOpen,
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(review);
                      }}
                      title={reviewTitle(review)}
                    >
                      <span className={cn(styles.title, styles.tableTitle)}>
                        <MatchedText text={reviewTitle(review)} />
                      </span>
                      <span
                        className={styles.repository}
                        title={review.repositoryPath ?? undefined}
                      >
                        <RepositoryName review={review} />
                      </span>
                    </ButtonPrimitive>
                  </td>
                  <td
                    className={cn(styles.td, last && styles.lastRowCell)}
                    title={review.origin?.branch}
                  >
                    <MatchedText
                      text={readableSourceBranch(review.origin?.branch) ?? "—"}
                    />
                  </td>
                  <td
                    className={cn(
                      styles.td,
                      styles.dateCell,
                      last && styles.lastRowCell,
                    )}
                    title={review.firstCreatedAt}
                  >
                    {formatCreatedTime(review.firstCreatedAt)}
                  </td>
                  <td
                    className={cn(
                      styles.td,
                      styles.inkCell,
                      styles.dateCell,
                      last && styles.lastRowCell,
                    )}
                    title={reviewUpdatedAt(review)}
                  >
                    {formatRelativeTime(reviewUpdatedAt(review))}
                  </td>
                  <td className={cn(styles.td, last && styles.lastRowCell)}>
                    <ReviewRowActions review={review} />
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 ? (
              <tr className={styles.row}>
                <td
                  colSpan={5}
                  className={cn(
                    styles.td,
                    styles.firstCell,
                    styles.strongCell,
                    styles.lastRowCell,
                  )}
                >
                  No reviews match this repository.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReviewRowActions({ review }: { review: ReviewApiSummary }) {
  const { onDelete } = useContext(AttentionActionsContext);
  const ui = useContext(CanvasUiContext);

  const menu = useCanvasMenu({
    items: [{ id: "delete", label: "Delete session" }],
    onSelect: () => onDelete?.(review),
  });

  if (!onDelete) return <DismissReviewButton review={review} />;

  return (
    <div
      className={styles.rowActions}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <IconButton
        size="large"
        className={[rowMenuStyles.trigger, menu.open && rowMenuStyles.expanded]}
        aria-label={`Actions for ${reviewTitle(review)}`}
        {...menu.triggerProps}
        disabled={!ui?.confirmDelete}
      >
        <Ellipsis className={rowMenuStyles.icon} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

function TableMenu<T extends string>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
}: {
  label: "Filter" | "Sort";
  ariaLabel: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
}) {
  return (
    <OptionMenu
      ariaLabel={ariaLabel}
      value={value}
      options={options}
      onChange={onChange}
      variant="outline"
      size="sm"
      triggerClassName={styles.menuTrigger}
    >
      {label === "Filter" ? (
        <ListFilter className={styles.menuIcon} aria-hidden="true" />
      ) : (
        <ArrowDownUp className={styles.menuIcon} aria-hidden="true" />
      )}
      <span>{label}</span>
      <strong className={styles.menuValue}>
        {options.find((option) => option.value === value)?.label ?? value}
      </strong>
    </OptionMenu>
  );
}

function formatCreatedTime(value: string | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";

  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * The scratchpad's own group, last on Home: a header in the workspace
 * header's grammar, then one card in the review card's grammar. No status,
 * workspace or dismissal, since it has none.
 */
function ScratchpadGroup({
  review,
  onOpen,
}: {
  review: ReviewApiSummary;
  onOpen(review: ReviewApiSummary): void;
}) {
  const contents = review.contents;

  return (
    <section className={styles.scratchpad} aria-label="Scratchpad">
      <div className={styles.cards}>
        <div className={styles.cardShell}>
          <ButtonPrimitive
            variant="ghost"
            size="xs"
            type="button"
            className={cn(
              "tw:h-auto tw:whitespace-normal tw:font-normal",
              styles.card,
            )}
            onClick={() => onOpen(review)}
          >
            <span className={styles.cardMain}>
              <span className={cn(styles.title, styles.cardTitle)}>
                <PencilIcon />
                <MatchedText text={reviewTitle(review)} />
              </span>
              <span className={styles.cardMeta}>
                {contents ? (
                  <>
                    <span>{countLabel(contents.blocks, "block")}</span>
                    <span className={styles.cardMetaNext}>
                      {countLabel(contents.diagrams, "diagram")}
                    </span>
                  </>
                ) : null}
                <span className={cn(contents && styles.cardMetaNext)}>
                  updated {formatRelativeTime(reviewUpdatedAt(review))}
                </span>
              </span>
            </span>
          </ButtonPrimitive>
        </div>
      </div>
    </section>
  );
}

function PencilIcon() {
  return <Pencil className={styles.scratchpadGlyph} aria-hidden="true" />;
}

/**
 * The one action an active review offers. One click: dismissal is reversible,
 * so it needs no arming step. It stays enabled for unavailable reviews so a
 * dead review can still leave the list.
 */
function DismissReviewButton({ review }: { review: ReviewApiSummary }) {
  const { onDismiss } = useContext(AttentionActionsContext);
  const [busy, setBusy] = useState(false);

  if (!onDismiss) return null;
  const title = reviewTitle(review);

  return (
    <IconButton
      size="small"
      className={styles.dismiss}
      aria-label={`Settle ${title}`}
      title="Settle session"
      loading={busy}
      disabled={busy}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        setBusy(true);
        void onDismiss(review)
          .catch(() => undefined)
          .finally(() => setBusy(false));
      }}
    >
      <ArchiveIcon className={styles.dismissIcon} />
    </IconButton>
  );
}

function DeleteReviewButton({
  review,
  onDelete,
}: {
  review: ReviewApiSummary;
  onDelete(review: ReviewApiSummary): Promise<void>;
}) {
  const ui = useContext(CanvasUiContext);
  const [busy, setBusy] = useState(false);

  return (
    <IconButton
      size="small"
      className={styles.delete}
      aria-label={`Delete ${reviewTitle(review)}`}
      title="Delete session"
      loading={busy}
      disabled={busy || !ui?.confirmDelete}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        setBusy(true);
        void onDelete(review)
          .catch(() => undefined)
          .finally(() => setBusy(false));
      }}
    >
      <TrashIcon />
    </IconButton>
  );
}

function RepositoryName({ review }: { review: ReviewApiSummary }) {
  const label = repositoryLabel(review);
  const separator = label.lastIndexOf("/");

  return separator < 0 ? (
    <strong className={styles.repositoryName}>
      <MatchedText text={label} />
    </strong>
  ) : (
    <>
      <span>
        <MatchedText text={label.slice(0, separator)} />
      </span>
      <span aria-hidden="true" className={styles.repositorySeparator}>
        /
      </span>
      <strong className={styles.repositoryName}>
        <MatchedText text={label.slice(separator + 1)} />
      </strong>
    </>
  );
}

export function reviewUpdatedAt(review: ReviewApiSummary): string {
  return review.createdAt;
}

/** {@link reviewUpdatedAt} as epoch milliseconds; 0 when unknown. */
function reviewUpdatedAtMs(review: ReviewApiSummary): number {
  return Date.parse(reviewUpdatedAt(review) ?? "") || 0;
}

function latestFirst(left: ReviewApiSummary, right: ReviewApiSummary): number {
  return reviewUpdatedAtMs(right) - reviewUpdatedAtMs(left);
}

export function formatRelativeTime(
  timestamp: string | null | undefined,
  now = Date.now(),
): string {
  if (!timestamp) return "unknown";
  const then = Date.parse(timestamp);

  if (!Number.isFinite(then)) return "unknown";
  const elapsed = Math.max(0, now - then);

  if (elapsed < 60_000) return "just now";
  const minutes = Math.floor(elapsed / 60_000);

  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);

  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(then);
}

function reviewTitle(review: ReviewApiSummary): string {
  return review.title.trim() || "Untitled session";
}

function matchesQuery(review: ReviewApiSummary, query: string): boolean {
  return fuzzyMatches(
    query,
    reviewTitle(review),
    repositoryLabel(review),
    review.repositoryPath ?? "",
    review.origin?.branch ?? "",
  );
}

function repositoryLabel(review: ReviewApiSummary): string {
  if (review.repositoryGroup) return review.repositoryGroup.label;

  return (
    review.repositoryName ??
    worktreeLabel(review.repositoryPath ?? review.pins?.repositoryId ?? "")
  );
}

function readableSourceBranch(value: string | null | undefined): string | null {
  if (!value || /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value)) return null;

  return value;
}

function worktreeLabel(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean);

  return parts.at(-1) ?? value;
}

export function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function SearchIcon() {
  return (
    <Search
      className={cn(styles.searchIcon, styles.searchStroke)}
      aria-hidden="true"
    />
  );
}

function ClearIcon() {
  return (
    <X
      className={cn(styles.clearIcon, styles.searchStroke)}
      aria-hidden="true"
    />
  );
}

function TrashIcon() {
  return (
    <Trash2
      className={cn(styles.deleteIcon, styles.deleteStroke)}
      aria-hidden="true"
    />
  );
}

const rowMenuStyles = {
  // Waits for its row's hover or focus.
  trigger:
    "tw:opacity-0 tw:[&:is(.canvas-row:hover_*)]:opacity-[1] tw:[&:is(.canvas-row:focus-within_*)]:opacity-[1]",
  expanded: "tw:opacity-[1]",
  icon: "tw:size-[16px] tw:fill-[none]",
};

const styles = {
  headerTools: "tw:flex tw:min-w-0 tw:items-center tw:gap-[8px]",
  // Fixed width, so the clear button appearing does not resize the field.
  search:
    "tw:flex tw:min-w-0 tw:items-center tw:w-[256px] tw:h-[38px] tw:p-[0_14px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:[&:focus-within]:border-[color:var(--accent)] tw:rounded-[6px] tw:bg-[color:var(--surface)] tw:[&:focus-within]:[box-shadow:0_0_0_3px_var(--marker-tint)] tw:text-[color:var(--ink-faint)] tw:[&:focus-within]:text-[color:var(--ink-muted)] tw:text-[length:15px] tw:gap-[12px]",
  searchIcon: "tw:size-[18px] tw:flex-[0_0_auto]",
  searchStroke:
    "tw:fill-[none] tw:stroke-[currentColor] tw:[stroke-linecap:round] tw:stroke-[1.5]",
  searchInput:
    "tw:min-w-0 tw:flex-[1] tw:p-0 tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:text-[color:var(--ink)] tw:bg-[color:var(--transparent)] tw:font-[family-name:inherit] tw:text-[length:inherit] tw:font-[number:inherit] tw:leading-[inherit] tw:[font-style:inherit] tw:[outline:none] tw:[&::placeholder]:text-[color:var(--review-home-meta)] tw:[&::-webkit-search-cancel-button]:appearance-none tw:[&::-webkit-search-decoration]:appearance-none",
  searchClear:
    "tw:grid tw:size-[16px] tw:flex-[0_0_auto] tw:p-0 tw:place-items-center tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:rounded-[4px] tw:text-[color:var(--review-home-meta)] tw:[&:hover]:text-[color:var(--ink)] tw:bg-[color:var(--transparent)] tw:[&:focus-visible]:[outline:1px_solid_var(--accent)] tw:[&:focus-visible]:outline-offset-[1px]",
  clearIcon: "tw:size-[11px] tw:flex-[0_0_auto]",
  // The user agent paints <mark> black on yellow, which is unreadable on the
  // canvas. Carry the mark on the background and inherit the text colour: on
  // a dark theme, recolouring the glyphs to the accent makes the matched word
  // dimmer than the words around it, which is the opposite of a highlight.
  // Inherit the weight too, so marking a run does not reflow its line.
  mark: "tw:p-[0_1px] tw:rounded-[4px] tw:bg-[color:color-mix(in_srgb,_var(--accent)_30%,_var(--transparent))] tw:text-[color:inherit] tw:font-[number:inherit]",
  // The scratchpad's group sits first, above the sessions table.
  scratchpad: "tw:pt-[14px] tw:mb-[16px]",
  cards:
    "tw:grid tw:grid-cols-[minmax(0,_336px)] tw:[grid-auto-rows:1fr] tw:gap-[18px] tw:[justify-content:start] tw:mt-[24px]",
  cardShell: "tw:relative tw:min-w-0",
  card: "tw:flex tw:flex-col tw:justify-between tw:gap-[12px] tw:w-full tw:min-w-0 tw:h-full tw:min-h-[128px] tw:p-[16px_16px_14px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:[&:focus-visible]:border-[color:var(--accent)] tw:[&:hover:not(:disabled)]:border-[color:var(--rule-soft)] tw:rounded-[8px] tw:text-[color:inherit] tw:bg-[color:var(--surface)] tw:text-left tw:[transition:border-color_120ms_ease,_box-shadow_120ms_ease] tw:[&:focus-visible]:[box-shadow:0_0_0_3px_var(--marker-tint)] tw:[&:focus-visible]:[outline:none] tw:[&:disabled]:[cursor:not-allowed] tw:[&:disabled]:opacity-[0.5]",
  cardMain: "tw:flex tw:flex-col tw:gap-[7px] tw:min-w-0",
  title:
    "tw:min-w-0 tw:overflow-hidden tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:17px] tw:font-medium tw:leading-[22px] tw:text-ellipsis tw:whitespace-nowrap",
  cardTitle:
    "tw:inline-flex tw:items-center tw:gap-[8px] tw:whitespace-normal tw:[-webkit-box-orient:vertical] tw:[-webkit-line-clamp:2]",
  tableTitle: "tw:block tw:w-full",
  cardMeta:
    "tw:flex tw:flex-wrap tw:items-baseline tw:gap-x-[10px] tw:gap-y-[3px] tw:text-[color:var(--review-home-meta)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[normal]",
  // Meta lines are one sentence of facts joined by a middle dot.
  cardMetaNext:
    'tw:[&::before]:[content:"·_"] tw:[&::before]:text-[color:var(--ink-faint)] tw:[&::before]:whitespace-pre',
  scratchpadGlyph:
    "tw:size-[14px] tw:fill-[none] tw:stroke-[var(--ink-faint)] tw:stroke-[1.2] tw:[stroke-linecap:round] tw:[stroke-linejoin:round]",
  // Dismissed reviews sit below the active list, collapsed.
  dismissed: "tw:flex tw:flex-col tw:gap-[10px] tw:mt-[26px]",
  dismissedToggle:
    "tw:inline-flex tw:self-start tw:items-center tw:gap-[8px] tw:p-[4px_0] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:var(--transparent)] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-sans)]",
  dismissedCount: "tw:font-medium tw:tracking-[0]",
  dismissedRows: "tw:flex tw:flex-col tw:gap-[6px]",
  dismissedRow:
    "tw:flex tw:items-center tw:gap-[14px] tw:p-[10px_14px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule-soft)] tw:rounded-[8px]",
  dismissedOpen:
    "tw:overflow-hidden tw:flex-[1_1_auto] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:var(--transparent)] tw:text-[color:var(--ink-muted)] tw:text-[length:13px] tw:text-left tw:text-ellipsis tw:whitespace-nowrap",
  dismissedClock:
    "tw:flex-[0_0_auto] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[normal] tw:opacity-[0.75]",
  restore: "tw:text-[color:var(--accent)]",
  delete:
    "tw:text-[color:var(--chrome-icon-fg)] tw:[&:hover:not(:disabled)]:text-[color:var(--change-removed)] tw:[&:focus-visible]:text-[color:var(--change-removed)]",
  deleteIcon: "tw:size-[13px]",
  deleteStroke:
    "tw:fill-[none] tw:stroke-[currentColor] tw:[stroke-linecap:round] tw:[stroke-linejoin:round] tw:stroke-[1.2]",
  // In the table it waits for its row's hover or focus.
  dismiss:
    "tw:opacity-0 tw:[&:is(.canvas-row:hover_*)]:opacity-[1] tw:[&:is(.canvas-row:focus-within_*)]:opacity-[1]",
  dismissIcon:
    "tw:size-[13px] tw:fill-[none] tw:stroke-[currentColor] tw:[stroke-linejoin:round] tw:stroke-[1.2]",
  // Paper desktop table: fixed metadata lanes and a flexible title column.
  tableSection: "tw:mt-[24px]",
  toolbar:
    "tw:flex tw:[@container_review-canvas_(max-width:_660px)]:flex-col tw:items-center tw:[@container_review-canvas_(max-width:_660px)]:items-start tw:justify-between tw:gap-[8px] tw:p-[8px_0_12px] tw:mb-[24px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule)] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-sans)] tw:text-[length:15px] tw:font-normal tw:leading-[24px]",
  controls:
    "tw:flex tw:[@container_review-canvas_(max-width:_660px)]:flex-wrap tw:items-center tw:justify-between tw:gap-[8px]",
  // A secondary Button held down while its menu is open.
  menuTrigger:
    "tw:border-[color:var(--rule)] tw:[&:is([aria-expanded=true])]:border-[color:var(--ink-faint)] tw:bg-[color:var(--surface)] tw:[&:hover]:bg-[color:var(--tray)] tw:[&:is([aria-expanded=true])]:bg-[color:var(--tray)] tw:text-[color:var(--ink-muted)]",
  menuValue: "tw:text-[color:var(--ink)] tw:font-medium",
  menuIcon:
    "tw:size-[14px] tw:shrink-0 tw:fill-[none] tw:stroke-[currentColor] tw:stroke-[1.8] tw:[stroke-linecap:round] tw:[stroke-linejoin:round]",
  tableScroll:
    "tw:overflow-x-auto tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:rounded-[8px]",
  table:
    "tw:w-full tw:min-w-[840px] tw:border-collapse tw:table-fixed tw:font-[family-name:var(--font-sans)] tw:text-[length:12px] tw:font-normal tw:leading-[18px]",
  colBranch:
    "tw:w-[296px] tw:[@container_review-canvas_(max-width:_1100px)]:w-[200px]",
  colDate: "tw:w-[136px]",
  colAction: "tw:w-[56px]",
  th: "tw:h-[36px] tw:p-[0_8px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule)] tw:bg-[color:var(--tray)] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-semibold tw:leading-[16px] tw:tracking-[0.04em] tw:uppercase tw:text-left tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap",
  row: "tw:cursor-pointer tw:[&:hover]:bg-[color:var(--tray)] tw:[&:focus-within]:bg-[color:var(--tray)]",
  td: "tw:h-[60px] tw:p-[0_8px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule)] tw:text-[color:var(--ink-muted)] tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap",
  firstCell: "tw:pl-[16px]",
  strongCell: "tw:text-[color:var(--ink)] tw:text-[length:13px] tw:font-medium",
  inkCell: "tw:text-[color:var(--ink)]",
  dateCell: "tw:text-[length:13px]",
  lastRowCell:
    "tw:[border-bottom-width:0] tw:[border-bottom-style:none] tw:[border-bottom-color:currentcolor]",
  tableOpen:
    "tw:flex tw:flex-col tw:gap-[2px] tw:w-full tw:min-w-0 tw:p-0 tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:text-[color:inherit] tw:text-left tw:bg-[color:transparent] tw:cursor-pointer",
  repository:
    "tw:block tw:max-w-full tw:overflow-hidden tw:text-ellipsis tw:text-[color:var(--ink-faint)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[14px]",
  repositoryName: "tw:font-normal",
  repositorySeparator: "tw:px-[5px]",
  visuallyHidden:
    "tw:absolute tw:size-[1px] tw:overflow-hidden tw:[clip-path:inset(50%)]",
  rowActions: "tw:flex tw:justify-center",
};
