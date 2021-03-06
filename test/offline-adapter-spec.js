/*global jasmine, beforeEach, afterEach, sinon, describe, expect, it, MM, spyOn, localStorage*/
describe('Local storage ', function () {
	'use strict';
	var fail = function (message) {
		throw new Error(message);
	};
	describe('OfflineAdapter', function () {
		var jsonStorage, underTest;
		beforeEach(function () {
			localStorage.clear();
			jsonStorage = MM.jsonStorage(localStorage);
			underTest = new MM.OfflineAdapter(new MM.OfflineMapStorage(jsonStorage, 'offline'));
		});
		it('recognises mapIds starting with "o"', function () {
			expect(underTest.recognises('oPress+Enter+To+Edit')).toBe(true);
			expect(underTest.recognises('g1234566797977797977')).toBe(false);
			expect(underTest.recognises('alaksjdflajsldkfjlas')).toBe(false);
		});
		describe('loadMap', function () {
			beforeEach(function () {
				localStorage.setItem('offline-map-99', '{"map":{"title":"Hello World","id":1}}');
			});
			it('should return map as promised', function () {
				underTest.loadMap('offline-map-99').then(
					function (map, mapId, mimeType) {
						expect(map).toEqual({title: 'Hello World', id: 1});
						expect(mapId).toBe('offline-map-99');
						expect(mimeType).toBe('application/json');
					},
					fail.bind(this, 'loadMap should succeed')
				);
			});
			it('should fail with not-found error if map not found', function () {
				var errorReason;
				underTest.loadMap('offline-map-999').then(
					fail.bind(this, 'loadMap should not succeed'),
					function (reason) {
						errorReason = reason;
					}
				);
				expect(errorReason).toBe('not-found');
			});
		});
		describe('saveMap', function () {
			it('should save an existing map from another storage provider into local storage when saveMap method is invoked', function () {
				underTest.saveMap(
					'file content',
					'g123',
					'file title.mup'
				).then(function () {
					expect(localStorage.getItem('offline-map-1')).toBe('{"map":"file content"}');
					expect(JSON.parse(localStorage.getItem('offline-maps')).nextMapId).toBe(2);
				}, fail.bind(this, 'saveMap should succeed'));
			});
			it('should remove .mup extension from file name', function () {
				underTest.saveMap(
					'file content',
					'offline-map-123',
					'file title.mup'
				);
				var files = JSON.parse(localStorage.getItem('offline-maps'));
				expect(files.maps['offline-map-123'].d).toEqual('file title');
			});
			it('should save an existing offline map into local storage when saveMap method is invoked', function () {
				underTest.saveMap(
					'file content',
					'offline-map-123',
					'file title.mup'
				);
				expect(localStorage.getItem('offline-map-123')).toBe('{"map":"file content"}');
			});
			it('should save a new map into local storage when saveMap method is invoked', function () {
				underTest.saveMap(
					'file content',
					'new',
					'file title.mup'
				).then(function () {
					expect(localStorage.getItem('offline-map-1')).toBe('{"map":"file content"}');
				}, fail.bind(this, 'saveMap should succeed'));
			});
			it('should fail with failed-offline when local storage throws an error (like quota exceeded)', function () {
				spyOn(jsonStorage, 'setItem').and.throwError('Quota exceeded');
				underTest.saveMap(
					'file content',
					'new',
					'file title.mup'
				).then(
					fail.bind(this, 'saveMap should not succeed'),
					function (reason) {
						expect(reason).toBe('local-storage-failed');
					}
				);
			});
		});
	});
	describe('OfflineMapStorage', function () {
		var jsonStorage, underTest, clock, map, mapObj;
		beforeEach(function () {
			clock = sinon.useFakeTimers();
			localStorage.clear();
			jsonStorage = MM.jsonStorage(localStorage);
			mapObj = { title: 'Hello World!' };
			map = JSON.stringify(mapObj);
			underTest = new MM.OfflineMapStorage(jsonStorage, 'offline');
		});
		afterEach(function () {
			clock.restore();
		});
		describe('saveNew file information', function () {
			it('should return mapId', function () {
				expect(underTest.saveNew(map)).toBe('offline-map-1');
			});
			it('should store file information and increment nextMapId', function () {
				clock.tick(2000);
				underTest.saveNew(map);
				expect(localStorage.getItem('offline-maps')).toBe('{"nextMapId":2,"maps":{"offline-map-1":{"d":"Hello World!","t":2}}}');
			});
			it('should store file content', function () {
				underTest.saveNew(map);
				expect(localStorage.getItem('offline-map-1')).toBe(JSON.stringify({'map': JSON.stringify({title: 'Hello World!'})}));
			});
		});
		describe('overwriting file information', function () {
			beforeEach(function () {
				mapObj.title = 'a new description!';
				map = JSON.stringify(mapObj);
			});
			it('should overwrite file content', function () {
				var mapId = underTest.saveNew(map);
				underTest.save(mapId, map);
				expect(localStorage.getItem('offline-map-1')).toBe(JSON.stringify({'map': JSON.stringify({title: 'a new description!'})}));
			});
			it('should update title and timestamp', function () {
				var mapId = underTest.saveNew(map);
				clock.tick(2000);
				underTest.save(mapId, map);
				expect(JSON.parse(localStorage.getItem('offline-maps')).maps).toEqual({'offline-map-1': {'d': 'a new description!', 't': 2}});
			});
		});
		describe('restoring file information', function () {
			var mapId, fileInfo;
			beforeEach(function () {
				fileInfo = {d: 'a restored description', t: 1};
				mapId = underTest.saveNew(map);
				mapObj.title = fileInfo.d;
				map = JSON.stringify(mapObj);
			});
			it('should restore map', function () {
				underTest.restore(mapId, map, fileInfo);
				expect(localStorage.getItem('offline-map-1')).toBe(JSON.stringify({'map': JSON.stringify({'title': 'a restored description'})}));
			});
			it('should restore title and timestamp', function () {
				clock.tick(22000);
				underTest.restore(mapId, map, fileInfo);
				expect(localStorage.getItem('offline-maps')).toBe('{"nextMapId":2,"maps":{"offline-map-1":{"d":"a restored description","t":1}}}');
			});
			it('should dispatch mapRestored event', function () {
				var listener = jasmine.createSpy();
				underTest.addEventListener('mapRestored', listener);
				underTest.restore(mapId, map, fileInfo);
				expect(listener).toHaveBeenCalledWith(mapId, map, fileInfo);
			});
		});
		describe('deleting file information', function () {
			var mapId;
			beforeEach(function () {
				mapId = underTest.saveNew(map);
			});
			it('should remove file content', function () {
				underTest.remove(mapId);
				expect(localStorage.getItem('offline-map-1')).toBeNull();
			});
			it('should remove file information', function () {
				underTest.remove(mapId);
				expect(localStorage.getItem('offline-maps')).toBe('{"nextMapId":2,"maps":{}}');
			});
			it('should dispatch mapDeleted event', function () {
				var listener = jasmine.createSpy();
				underTest.addEventListener('mapDeleted', listener);
				underTest.remove(mapId);
				expect(listener).toHaveBeenCalledWith(mapId);
			});
		});
		describe('retrieving files and file information', function () {
			var mapId1, mapId2;
			beforeEach(function () {
				mapId1 = underTest.saveNew(map);
				mapObj.title = 'new description';
				map = JSON.stringify(mapObj);
				mapId2 = underTest.saveNew(map);
			});
			it('should return a list of files', function () {
				expect(underTest.list()).toEqual({
					'offline-map-1': {
						d: 'Hello World!',
						t: 0
					},
					'offline-map-2': {
						d: 'new description',
						t: 0
					}
				});
			});
			it('should return file content', function () {
				expect(underTest.load(mapId1)).toEqual(JSON.stringify({ title: 'Hello World!'}));
			});
		});
	});
});
