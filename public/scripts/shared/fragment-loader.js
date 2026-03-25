export async function loadFragments(root = document) {
  const placeholders = Array.from(root.querySelectorAll('[data-fragment]'));

  await Promise.all(
    placeholders.map(async (placeholder) => {
      const fragmentPath = placeholder.dataset.fragment;
      const response = await fetch(fragmentPath, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error(`Failed to load ${fragmentPath}`);
      }

      const template = document.createElement('template');
      template.innerHTML = (await response.text()).trim();
      placeholder.replaceWith(template.content);
    }),
  );
}