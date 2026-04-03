'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type CsvSidebarGroup = {
  group: string;
  pages: Array<{
    pageId: string;
    csvName: string;
    tableCount: number;
  }>;
};

type CsvSidebarProps = {
  currentPageId?: string;
  groups: CsvSidebarGroup[];
  onPageSelect?: (pageId: string) => void;
  onPageHover?: (pageId: string) => void;
};

const STORAGE_KEY = 'aresdevunit.tables.sidebar';

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg aria-hidden="true" className="tables-sidebar-chevron" viewBox="0 0 12 12">
      <path
        d={collapsed ? 'M2 4.25 6 8l4-3.75' : 'M2 7.75 6 4l4 3.75'}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function appendViewParam(href: string, view: string | null) {
  if (!view) return href;
  const params = new URLSearchParams(href.split('?')[1] ?? '');
  params.set('view', view);
  return `/tables?${params.toString()}`;
}

export function CsvSidebar({ currentPageId, groups, onPageSelect, onPageHover }: CsvSidebarProps) {
  const searchParams = useSearchParams();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const currentView = searchParams.get('view');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object' && saved.openGroups && typeof saved.openGroups === 'object') {
        setOpenGroups(saved.openGroups as Record<string, boolean>);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const activeGroup = groups.find((group) => group.pages.some((page) => page.pageId === currentPageId))?.group;
    if (!activeGroup) return;
    setOpenGroups((current) => (current[activeGroup] ? current : { ...current, [activeGroup]: true }));
  }, [currentPageId, groups]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ openGroups }));
    } catch {
      // ignore
    }
  }, [openGroups]);

  const filteredGroups = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return groups;

    return groups
      .map((group) => {
        if (group.group.toLowerCase().includes(keyword)) {
          return group;
        }

        const pages = group.pages.filter((page) => page.csvName.toLowerCase().includes(keyword));
        if (pages.length === 0) return null;

        return {
          ...group,
          pages,
        };
      })
      .filter((group): group is CsvSidebarGroup => group !== null);
  }, [groups, query]);

  const allOpen = useMemo(
    () => filteredGroups.length > 0 && filteredGroups.every((group) => Boolean(openGroups[group.group])),
    [filteredGroups, openGroups]
  );

  const toggleGroup = (group: string) => {
    setOpenGroups((current) => ({ ...current, [group]: !current[group] }));
  };

  const toggleAllGroups = () => {
    setOpenGroups(allOpen ? {} : Object.fromEntries(filteredGroups.map((group) => [group.group, true])));
  };

  return (
    <div className="tables-sidebar">
      <div className="tables-sidebar-head">
        <div>
          <p className="tables-sidebar-eyebrow">CSV 목록</p>
          <h2 className="tables-sidebar-title">테이블 탐색</h2>
        </div>
        <button className="tables-sidebar-action" onClick={toggleAllGroups} type="button">
          {allOpen ? '모두 접기' : '모두 펼치기'}
        </button>
      </div>

      <label className="tables-sidebar-search" htmlFor="tables-sidebar-search">
        <span className="sr-only">테이블 검색</span>
        <input
          className="tables-sidebar-search-input"
          id="tables-sidebar-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="테이블 검색"
          type="search"
          value={query}
        />
      </label>

      <div className="tables-sidebar-groups">
        {filteredGroups.map((group) => {
          const isOpen = Boolean(openGroups[group.group]);

          return (
            <section className="tables-sidebar-group" key={group.group}>
              <button className="tables-sidebar-group-toggle" onClick={() => toggleGroup(group.group)} type="button">
                <span>{group.group}</span>
                <span aria-hidden="true" className="tables-sidebar-group-icon">
                  <ChevronIcon collapsed={!isOpen} />
                </span>
              </button>

              {isOpen ? (
                <div className="tables-sidebar-links">
                  {group.pages.map((item) => {
                    const href = appendViewParam(`/tables?page=${item.pageId}`, currentView);
                    const active = item.pageId === currentPageId;

                    return onPageSelect ? (
                      <button
                        className={active ? 'tables-sidebar-link active' : 'tables-sidebar-link'}
                        key={item.pageId}
                        onClick={() => onPageSelect(item.pageId)}
                        onMouseEnter={onPageHover ? () => onPageHover(item.pageId) : undefined}
                        type="button"
                      >
                        <span className="tables-sidebar-link-label">{item.csvName}</span>
                        <small>{item.tableCount}개</small>
                      </button>
                    ) : (
                      <Link
                        className={active ? 'tables-sidebar-link active' : 'tables-sidebar-link'}
                        href={href}
                        key={item.pageId}
                      >
                        <span className="tables-sidebar-link-label">{item.csvName}</span>
                        <small>{item.tableCount}개</small>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}

        {filteredGroups.length === 0 ? <p className="tables-sidebar-empty">검색 결과가 없습니다.</p> : null}
      </div>
    </div>
  );
}
