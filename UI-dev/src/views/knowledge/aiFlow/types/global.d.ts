// Global declarations for AI Flow

// Extend the Window interface to include $glob
interface Window {
	$glob: Record<string, any>;
}

// Extend Vue prototype
declare module 'vue/types/vue' {
	interface Vue {
		$route: {
			params: {
				id: string;
			};
		};
		$log?: {
			warn?: (...args: any[]) => void;
			error?: (...args: any[]) => void;
			info?: (...args: any[]) => void;
		};
		$nextTick: (callback: () => void) => void;
		deepClone<T>(obj: T): T;
	}
}
