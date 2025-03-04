function goToProjects() {
	window.location.href = "projects.html";
}

// List of projects 
const projects = [
	{name: "Falling Sand Simulator", image: "screenshots/falling-sand.png", path: "./projects/falling-sand/index.html"},
	{name: "Boid Simulator", image: "screenshots/placeholder.png", path: "./projects/boid-simulator/index.html"}

];

// Dynamically genearte project grid
document.addEventListener("DOMContentLoaded", function() {
	const gridContainer = document.getElementById("projectsGrid");
	if (!gridContainer) return;

	projects.forEach(project => {
		//if (!project.path) {
		//	console.error(`Project "${project.name}" has not path!`);
		//	return;
		//}
		const projectDiv = document.createElement("div");
		projectDiv.classList.add("grid-item");

		projectDiv.innerHTML = `
            <a href="${project.path}">
                <img src="${project.image}" alt="${project.name}">
                <p>${project.name}</p>
            </a>
        `;
		gridContainer.appendChild(projectDiv);
	});

});