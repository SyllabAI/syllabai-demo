/**
 * Document-focus routes — the paper PDF (or the interactive player) IS the
 * screen there. Global and course chrome stand down on them:
 *   - CourseShell collapses the sidebar to the 44px rail;
 *   - AppShell omits the site footer (it would sit just below the
 *     viewport-filling panes and create a pointless page scroll);
 *   - the viewer route itself renders no breadcrumbs / h1 hero.
 */
export function isDocumentFocusRoute(pathname: string): boolean {
  return (
    /\/past-papers\/view\//.test(pathname) || /\/past-papers\/[^/]+$/.test(pathname)
  );
}
