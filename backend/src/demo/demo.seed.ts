const filterDefaults = {
  enabled: true,
  delay: 0,
  except_releases: '',
  announce_types: [] as string[],
  resolutions: [] as string[],
  sources: [] as string[],
  match_categories: '',
  is_auto_updated: false,
  release_profile_duplicate: null,
  match_release_groups: '',
  except_release_groups: '',
} as const;

export const DEMO_FILTERS = [
  {
    name: 'freeleech-high-priority',
    version: '1',
    _id: 'demo_filter_small',
    data: {
      ...filterDefaults,
      min_size: '100 MB',
      max_size: '2 GB',
      max_downloads: 20,
      max_downloads_unit: 'DAY',
      freeleech: true,
      priority: 1,
    },
  },
  {
    name: 'freeleech-medium-priority',
    version: '1',
    _id: 'demo_filter_medium',
    data: {
      ...filterDefaults,
      min_size: '2 GB',
      max_size: '10 GB',
      max_downloads: 10,
      max_downloads_unit: 'DAY',
      freeleech: true,
      priority: 2,
    },
  },
  {
    name: 'freeleech-low-priority',
    version: '1',
    _id: 'demo_filter_large',
    data: {
      ...filterDefaults,
      min_size: '10 GB',
      max_size: '50 GB',
      max_downloads: 3,
      max_downloads_unit: 'DAY',
      freeleech: true,
      priority: 3,
    },
  },
];
