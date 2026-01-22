#!/usr/bin/env node
"use strict";

const fs = require("fs/promises");
const path = require("path");

const VALID_BUMPS = new Set(["major", "minor", "patch"]);
const DEFAULT_BUMP = "patch";

function printUsage() {
    const usage = `
Usage:
  node scripts/create-changeset.js --summary "message" [--packages "<pkg>:<bump>[,<pkg>:<bump>...]"] [--bump patch]

Options:
  --packages, -p   Optional comma-separated list of package bump pairs. Example: "@scope/pkg:minor,@scope/other:patch".
                   When omitted, all workspace packages will use the bump provided via --bump.
  --summary, -s    Summary text written to the changeset body. Use quotes to preserve spaces.
  --summary-file   Path to a file whose contents should be used as the summary.
  --bump, -b       Default bump type (major|minor|patch) applied when --packages is omitted. Defaults to "patch".
  --dry-run        Show the generated changeset without writing a file.
  --help, -h       Show this help text.
`;
    console.log(usage.trim());
}

function parseArgs(rawArgs) {
    const options = {
        packageSpecs: [],
        summary: undefined,
        summaryFile: undefined,
        dryRun: false,
        bump: undefined
    };

    for (let i = 0; i < rawArgs.length; i++) {
        const arg = rawArgs[i];
        switch (arg) {
            case "--packages":
            case "-p": {
                const value = rawArgs[++i];
                if (!value) {
                    throw new Error("Missing value for --packages");
                }
                options.packageSpecs.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
                break;
            }
            case "--summary":
            case "-s": {
                const value = rawArgs[++i];
                if (typeof value !== "string") {
                    throw new Error("Missing value for --summary");
                }
                options.summary = value;
                break;
            }
            case "--summary-file": {
                const value = rawArgs[++i];
                if (typeof value !== "string") {
                    throw new Error("Missing value for --summary-file");
                }
                options.summaryFile = value;
                break;
            }
            case "--dry-run": {
                options.dryRun = true;
                break;
            }
            case "--bump":
            case "-b": {
                const value = rawArgs[++i];
                if (!value) {
                    throw new Error("Missing value for --bump");
                }
                options.bump = value;
                break;
            }
            case "--help":
            case "-h": {
                printUsage();
                process.exit(0);
                break;
            }
            default: {
                if (arg.startsWith("-")) {
                    throw new Error(`Unknown option: ${arg}`);
                }
                // Treat stray values as package specs for convenience.
                options.packageSpecs.push(arg);
            }
        }
    }

    if (options.packageSpecs.length === 0 && process.env.PACKAGES) {
        options.packageSpecs.push(
            ...process.env.PACKAGES.split(",").map((item) => item.trim()).filter(Boolean)
        );
    }

    if (!options.summary && !options.summaryFile && process.env.SUMMARY) {
        options.summary = process.env.SUMMARY;
    }

    if (!options.summary && !options.summaryFile && process.env.SUMMARY_FILE) {
        options.summaryFile = process.env.SUMMARY_FILE;
    }

    if (!options.dryRun && process.env.DRY_RUN) {
        options.dryRun = process.env.DRY_RUN.toLowerCase() === "true";
    }

    if (options.summaryFile && options.summary) {
        throw new Error("Provide either --summary or --summary-file, not both");
    }

    if (!options.bump && process.env.BUMP) {
        options.bump = process.env.BUMP;
    }

    return options;
}

function parsePackageSpecs(packageSpecs) {
    return packageSpecs.map((spec) => {
        const [pkg, bump] = spec.split(":");
        if (!pkg || !bump) {
            throw new Error(`Invalid package specification "${spec}". Expected "<package>:<bump>".`);
        }
        const trimmedPkg = pkg.trim();
        const normalizedBump = bump.trim().toLowerCase();
        if (!VALID_BUMPS.has(normalizedBump)) {
            throw new Error(`Invalid bump type "${normalizedBump}" for package "${trimmedPkg}". Use major|minor|patch.`);
        }
        return {
            name: trimmedPkg,
            bump: normalizedBump
        };
    });
}

async function readSummary(summary, summaryFile) {
    if (typeof summary === "string") {
        const trimmed = summary.trim();
        if (!trimmed) {
            throw new Error("Summary cannot be empty");
        }
        return trimmed;
    }
    if (typeof summaryFile === "string") {
        const filePath = path.resolve(summaryFile);
        const contents = await fs.readFile(filePath, "utf8");
        const trimmed = contents.trim();
        if (!trimmed) {
            throw new Error(`Summary file "${summaryFile}" is empty`);
        }
        return trimmed;
    }
    throw new Error("Summary is required. Provide --summary or --summary-file.");
}

function slugify(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}

async function mapPackageNamesToDirs(workspaceRoot) {
    const packageDirs = ["packages", "apps"];
    const result = new Map();

    for (const dir of packageDirs) {
        const folderPath = path.join(workspaceRoot, dir);
        try {
            const entries = await fs.readdir(folderPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) {
                    continue;
                }
                const packageJsonPath = path.join(folderPath, entry.name, "package.json");
                try {
                    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
                    if (packageJson && packageJson.name) {
                        result.set(packageJson.name, packageJsonPath);
                    }
                } catch {
                    // Ignore missing package.json files
                }
            }
        } catch {
            // Directory might not exist; keep going
        }
    }

    return result;
}

async function validatePackages(packages, workspacePackages) {
    const unknown = packages.filter((pkg) => !workspacePackages.has(pkg.name));
    if (unknown.length > 0) {
        const missing = unknown.map((pkg) => pkg.name).join(", ");
        throw new Error(`Package(s) not found in workspace: ${missing}`);
    }
}

async function generateFileName(targetDir, summary) {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
    const slug = slugify(summary) || "changes";
    let candidate = `${timestamp}-${slug}`;
    let counter = 1;

    while (true) {
        const fullPath = path.join(targetDir, `${candidate}.md`);
        try {
            await fs.access(fullPath);
            candidate = `${timestamp}-${slug}-${counter++}`;
        } catch {
            return `${candidate}.md`;
        }
    }
}

function createChangesetMarkdown(packages, summary) {
    const headerLines = packages.map((pkg) => `"${pkg.name}": ${pkg.bump}`);
    return `---
${headerLines.join("\n")}
---

${summary}
`;
}

async function main() {
    try {
        const options = parseArgs(process.argv.slice(2));
        const summary = await readSummary(options.summary, options.summaryFile);

        const workspaceRoot = process.cwd();
        const changesetDir = path.join(workspaceRoot, ".changeset");
        await ensureDir(changesetDir);

        const workspacePackages = await mapPackageNamesToDirs(workspaceRoot);
        const bumpInput = options.bump ?? DEFAULT_BUMP;
        const defaultBump = bumpInput.toString().trim().toLowerCase();
        if (!VALID_BUMPS.has(defaultBump)) {
            throw new Error(`Invalid bump type "${bumpInput}". Use major|minor|patch.`);
        }

        let packageEntries;
        if (options.packageSpecs.length === 0) {
            const packageNames = Array.from(workspacePackages.keys()).sort();
            if (packageNames.length === 0) {
                throw new Error("No workspace packages found to include in the changeset.");
            }
            packageEntries = packageNames.map((name) => ({
                name,
                bump: defaultBump
            }));
        } else {
            packageEntries = parsePackageSpecs(options.packageSpecs);
        }

        await validatePackages(packageEntries, workspacePackages);

        const content = createChangesetMarkdown(packageEntries, summary);

        if (options.dryRun) {
            console.log("Dry run - generated changeset:\n");
            console.log(content);
            return;
        }

        const fileName = await generateFileName(changesetDir, summary);
        const targetPath = path.join(changesetDir, fileName);
        await fs.writeFile(targetPath, content, "utf8");

        console.log(`Created ${path.relative(workspaceRoot, targetPath)}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
