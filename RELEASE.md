# Development

## Packaging

The GitHub Action relies on `lib/index.js` as the entrypoint. This entrypoint needs to be committed after every change. Use the following command to package the code into `lib/index.js`.

```txt
npm run build
```

## Releases

1. Create a semver tag pointing to the commit you want to release. E.g. to create `v1.4.4` from tip-of-tree:

    ```txt
    git checkout master
    git pull origin master
    git tag v1.4.4
    git push origin v1.4.4
    ```

1. Draft a new release on GitHub using the new semver tag.
1. Update the sliding tag (`v1`) to point to the new release commit. Note that existing users relying on the `v1` will get auto-updated.

### Updating sliding tag

Follow these steps to move the `v1` to a new version `v1.4.4`.

```txt
git tag -f v1 v1.4.4
git push -f origin v1
```
