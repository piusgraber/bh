// +page.js or +page.server.js
export function load({ params }) {
	const { id } = params;

	return {
		id,
		data: `Data for ${id}`
	};
}
